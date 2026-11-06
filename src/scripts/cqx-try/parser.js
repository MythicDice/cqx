/* CQX v0.2 浏览器端严格解析器
 * 按 reference/CQX-v0.2/cqx.py 移植：标签候选、固定简写表、属性与位置参数、
 * 原样代码、引用展开、转发空白、AST 正规化、语义校验与诊断码。
 * 解析结果为与 Python as_json() 一致的消息树；错误码与码点偏移同样对齐。
 */

export const VERSION = '0.2';

const WS = ' \t\r\n';
const NAME_RE = /^[A-Za-z][A-Za-z0-9_.-]*/;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*/;
const KEY_FULL_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const AT_RE = /\[@([A-Za-z0-9_.-]+)\]/y;
const CLOSE_RE = /\[\/([A-Za-z][A-Za-z0-9_.-]*)\]/y;
const SHORT_START_RE = /\[([A-Za-z][A-Za-z0-9_.-]*)(?=[ \t\r\n/\]])/y;
const RFC3339_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** v0.2 冻结的简写表：位置参数对应属性。 */
export const POSITIONAL = {
  link: 'href',
  img: 'src',
  reply: 'id',
  face: 'id',
  audio: 'src',
  video: 'src',
  file: 'src',
  ref: 'id',
};
export const SHORT_ATOMIC = new Set(['img', 'reply', 'face', 'audio', 'video', 'file', 'ref']);
export const SHORT_BLOCK = new Set(['b', 'i', 'code', 'link', 'msg', 'forward']);

const BUILTIN_ATOMIC = new Set(['at', 'img', 'reply', 'face', 'audio', 'video', 'file']);
const BUILTIN_BLOCK = new Set(['b', 'i', 'code', 'link']);
const REQUIRED_ATTRIBUTE = {
  img: 'src',
  reply: 'id',
  face: 'id',
  audio: 'src',
  video: 'src',
  file: 'src',
  link: 'href',
};

/** 判断字符串是否含未配对的代理码位（合法代理对按单个 Unicode 标量值处理）。 */
function hasUnpairedSurrogate(value) {
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = value.charCodeAt(i + 1);
      if (n >= 0xdc00 && n <= 0xdfff) {
        i += 1;
        continue;
      }
      return true;
    }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !RFC3339_RE.test(value)) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!m) return false;
  const [, , month, day, hour, minute, second, , offHour, offMinute] = m;
  if (+month < 1 || +month > 12 || +day < 1 || +day > 31) return false;
  if (+hour > 23 || +minute > 59 || +second > 59) return false;
  if (offHour !== undefined && (+offHour > 23 || +offMinute > 59)) return false;
  return Number.isFinite(Date.parse(value));
}

/** 严格解析错误：code 为 v0.2 诊断码，offset 为从 0 开始的 Unicode 码点偏移。 */
export class CQXError extends Error {
  constructor(code, detail, source, utf16Offset = 0) {
    const before = Array.from(source.slice(0, utf16Offset));
    const offset = before.length;
    const line = before.filter((c) => c === '\n').length + 1;
    const lastBreak = before.lastIndexOf('\n');
    const column = offset - lastBreak;
    super(`${code} 第 ${line} 行第 ${column} 列：${detail}`);
    this.name = 'CQXError';
    this.code = code;
    this.detail = detail;
    this.offset = offset;
    // 码点偏移用于规范诊断；UTF-16 偏移用于编辑器 DOM 定位。
    this.utf16Offset = utf16Offset;
    this.line = line;
    this.column = column;
  }
}

/** 外部构造的 AST 校验错误，带节点路径。 */
export class CQXASTError extends Error {
  constructor(code, detail, path) {
    super(`${code} ${path}：${detail}`);
    this.name = 'CQXASTError';
    this.code = code;
    this.detail = detail;
    this.path = path;
  }
}

function text(value) {
  return { type: 'text', text: value };
}

function element(name, attrs, children, mode) {
  return { type: 'element', name, attrs, mode, children };
}

/** 内置元素的结构与属性校验，返回 [诊断码, 说明] 或 null。 */
function validateSemantics(node, parent) {
  const a = node.attrs;
  const n = node.name;
  if (BUILTIN_ATOMIC.has(n) && node.mode !== 'void') {
    return ['E_SCHEMA', `${n} 必须是原子元素`];
  }
  if (BUILTIN_BLOCK.has(n) && node.mode !== 'block') {
    return ['E_SCHEMA', `${n} 需要结束标签`];
  }
  if (REQUIRED_ATTRIBUTE[n] && !a[REQUIRED_ATTRIBUTE[n]]) {
    return ['E_SCHEMA', `${n} 需要非空的 ${REQUIRED_ATTRIBUTE[n]} 属性`];
  }
  if (n === 'at') {
    const byId = Boolean(a.id) && !('type' in a);
    const byType = a.type === 'all' && !('id' in a);
    if (!(byId || byType)) return ['E_SCHEMA', 'at 必须恰好指定非空 id 或 type=all'];
  }
  if (n === 'msg') {
    if (parent !== 'forward') return ['E_PARENT', 'msg 只能是 forward 的直接子节点'];
    if (node.mode === 'void') {
      if (!a.id || 'user' in a || 'name' in a) {
        return ['E_SCHEMA', '原子 msg 需要非空 id，且不得含 user 或 name'];
      }
    } else if (node.mode === 'block') {
      if (!a.user || 'id' in a) {
        return ['E_SCHEMA', '容器 msg 需要非空 user，且不得含 id'];
      }
    } else {
      return ['E_SCHEMA', 'msg 模式非法'];
    }
    if ('time' in a && !validTimestamp(a.time)) {
      return ['E_SCHEMA', 'msg 的 time 必须带时区偏移且符合 RFC 3339'];
    }
  }
  if (n === 'forward') {
    if (node.mode === 'void') {
      if (!a.id) return ['E_SCHEMA', '原子 forward 需要非空 id'];
    } else if (node.mode === 'block') {
      if ('id' in a) return ['E_SCHEMA', '容器 forward 不得含 id'];
      if (!node.children.length) return ['E_SCHEMA', '容器 forward 至少需要一个 msg 子节点'];
      if (node.children.some((c) => c.type !== 'element' || c.name !== 'msg')) {
        return ['E_SCHEMA', 'forward 的子节点只能是 msg'];
      }
    } else {
      return ['E_SCHEMA', 'forward 模式非法'];
    }
  }
  return null;
}

/** 校验并正规化消息树：合并文本、删除空文本、属性排序、移除转发排版空白。 */
export function normalizeAst(nodes, options = {}) {
  const { maxDepth = 64, maxNodes = 10000 } = options;
  if (!Array.isArray(nodes)) throw new CQXASTError('E_AST', '文档必须是节点数组', 'document');
  if (maxDepth < 0 || maxNodes < 0) throw new RangeError('资源限制不得为负数');
  let visited = 0;

  const walk = (children, parent, path, depth) => {
    if (depth > maxDepth) throw new CQXASTError('E_LIMIT', '超过最大嵌套深度', path);
    if (!Array.isArray(children)) {
      throw new CQXASTError('E_AST', 'children 必须是节点数组', path);
    }
    const result = [];
    children.forEach((entry, index) => {
      const at = `${path}[${index}]`;
      visited += 1;
      if (visited > maxNodes) throw new CQXASTError('E_LIMIT', '超过最大节点数', at);
      if (!entry || typeof entry !== 'object') {
        throw new CQXASTError('E_AST', '未知节点类型', at);
      }
      if (entry.type === 'text') {
        if (typeof entry.text !== 'string' || hasUnpairedSurrogate(entry.text)) {
          throw new CQXASTError('E_UNICODE', '正文必须是 Unicode 标量值序列', at);
        }
        if (parent === 'forward') {
          if (Array.from(entry.text).some((c) => !WS.includes(c))) {
            throw new CQXASTError('E_PARENT', 'forward 只允许排版空白文本', at);
          }
          return;
        }
        if (!entry.text) return;
        const last = result[result.length - 1];
        if (last && last.type === 'text') {
          result[result.length - 1] = text(last.text + entry.text);
        } else {
          result.push(text(entry.text));
        }
        return;
      }
      if (entry.type !== 'element') throw new CQXASTError('E_AST', '未知节点类型', at);
      if (typeof entry.name !== 'string' || !NAME_RE.test(entry.name) ||
          entry.name.length !== (NAME_RE.exec(entry.name)?.[0].length ?? -1)) {
        throw new CQXASTError('E_NAME', '元素名称非法', at);
      }
      if (entry.mode !== 'void' && entry.mode !== 'block') {
        throw new CQXASTError('E_AST', '元素模式只能是 void 或 block', at);
      }
      if (!entry.attrs || typeof entry.attrs !== 'object' || Array.isArray(entry.attrs)) {
        throw new CQXASTError('E_AST', '属性必须是名称到字符串的映射', at);
      }
      const sorted = {};
      for (const key of Object.keys(entry.attrs).sort()) {
        if (!KEY_FULL_RE.test(key)) throw new CQXASTError('E_NAME', '属性名称非法', at);
        const value = entry.attrs[key];
        if (typeof value !== 'string' || hasUnpairedSurrogate(value)) {
          throw new CQXASTError('E_UNICODE', '属性值必须是 Unicode 标量值序列', at);
        }
        sorted[key] = value;
      }
      if (entry.mode === 'void' && entry.children && entry.children.length) {
        throw new CQXASTError('E_AST', '原子元素不得含子节点', at);
      }
      const childrenNormalized = walk(entry.children || [], entry.name, `${at}.children`, depth + 1);
      const node = element(entry.name, sorted, childrenNormalized, entry.mode);
      const problem = validateSemantics(node, parent);
      if (problem) throw new CQXASTError(problem[0], problem[1], at);
      result.push(node);
    });
    return result;
  };

  return walk(nodes, null, 'document', 0);
}

/** 正文转义：只处理 \ 与 [。 */
export function escapeText(value) {
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) {
    throw new TypeError('需要 Unicode 标量值字符串');
  }
  return value.replace(/\\/g, '\\\\').replace(/\[/g, '\\[');
}

/** 属性值编码：JSON 双引号字符串，不转义非 ASCII 与斜线。 */
export function encodeAttr(value) {
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) {
    throw new TypeError('需要 Unicode 标量值字符串');
  }
  return JSON.stringify(value);
}

/** 由消息树生成唯一的规范化 v0.2 文本。 */
export function serializeCanonical(nodes) {
  const normalized = normalizeAst(nodes);
  const emit = (node) => {
    if (node.type === 'text') return escapeText(node.text);
    const attrs = Object.keys(node.attrs)
      .sort()
      .map((key) => ` ${key}=${encodeAttr(node.attrs[key])}`)
      .join('');
    if (node.mode === 'void') return `[:${node.name}${attrs}/]`;
    return `[:${node.name}${attrs}]${node.children.map(emit).join('')}[/${node.name}]`;
  };
  return normalized.map(emit).join('');
}

function trimWS(value) {
  return value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
}

class Parser {
  constructor(source, { maxDepth, maxNodes }) {
    this.s = source;
    this.i = 0;
    this.maxDepth = maxDepth;
    this.maxNodes = maxNodes;
    this.numNodes = 0;
  }

  error(code, detail, offset) {
    throw new CQXError(code, detail, this.s, offset ?? this.i);
  }

  addNode(at) {
    this.numNodes += 1;
    if (this.numNodes > this.maxNodes) this.error('E_LIMIT', '节点数超过资源限制', at);
  }

  match(regex) {
    regex.lastIndex = this.i;
    return regex.exec(this.s);
  }

  parse() {
    const nodes = this.nodes(null, 0);
    return normalizeAst(nodes, { maxDepth: this.maxDepth, maxNodes: this.maxNodes });
  }

  nodes(expectedClose, depth) {
    if (depth > this.maxDepth) this.error('E_LIMIT', '超过最大嵌套深度');
    const result = [];
    let buf = '';
    const flush = () => {
      if (buf) {
        this.addNode(this.i);
        result.push(text(buf));
        buf = '';
      }
    };

    while (this.i < this.s.length) {
      const ch = this.s[this.i];
      if (ch === '\\' && this.i + 1 < this.s.length &&
          (this.s[this.i + 1] === '[' || this.s[this.i + 1] === '\\')) {
        buf += this.s[this.i + 1];
        this.i += 2;
        continue;
      }
      if (ch !== '[') {
        buf += ch;
        this.i += 1;
        continue;
      }
      const token = this.tag();
      if (token === null) {
        buf += '[';
        this.i += 1;
        continue;
      }
      flush();
      this.i = token.end;
      if (token.kind === 'close') {
        if (expectedClose === null) {
          this.error('E_CLOSE', `多余的结束标签 [/${token.name}]`, token.start);
        }
        if (token.name !== expectedClose) {
          this.error('E_CLOSE', `期望 [/${expectedClose}]，实际为 [/${token.name}]`, token.start);
        }
        return result;
      }
      let node;
      if (token.kind === 'void') {
        node = element(token.name, token.attrs, [], 'void');
      } else {
        const children = token.raw
          ? this.rawCode(token.start)
          : this.nodes(token.name, depth + 1);
        node = element(token.name, token.attrs, children, 'block');
      }
      if (node.name === 'forward' && node.mode === 'block') {
        node = element(node.name, node.attrs,
          node.children.filter((c) => !(c.type === 'text' &&
            Array.from(c.text).every((ch2) => WS.includes(ch2)))),
          node.mode);
      }
      if (node.name === 'msg' && expectedClose !== 'forward') {
        this.error('E_PARENT', 'msg 只能作为 forward 的直接子节点', token.start);
      }
      const problem = validateSemantics(node, expectedClose);
      if (problem) this.error(problem[0], problem[1], token.start);
      this.addNode(token.start);
      result.push(node);
    }
    flush();
    if (expectedClose !== null) this.error('E_CLOSE', `缺少结束标签 [/${expectedClose}]`);
    return result;
  }

  /** [code raw] 正文按字面读取，只有 \[/code] 作为字面关闭标记。 */
  rawCode(start) {
    let value = '';
    while (this.i < this.s.length) {
      if (this.s.startsWith('\\[/code]', this.i)) {
        value += '[/code]';
        this.i += '\\[/code]'.length;
      } else if (this.s.startsWith('[/code]', this.i)) {
        this.i += '[/code]'.length;
        if (value) {
          this.addNode(start);
          return [text(value)];
        }
        return [];
      } else {
        value += this.s[this.i];
        this.i += 1;
      }
    }
    this.error('E_RAW_CLOSE', '[code raw] 缺少关闭标记', start);
  }

  tag() {
    const start = this.i;
    const s = this.s;
    let m = this.match(AT_RE);
    if (m) {
      const word = m[1];
      const attrs = word === 'all' ? { type: 'all' } : { id: word };
      return { kind: 'void', name: 'at', attrs, start, end: this.i + m[0].length };
    }
    m = this.match(CLOSE_RE);
    if (m) {
      return { kind: 'close', name: m[1], attrs: {}, start, end: this.i + m[0].length };
    }

    const generic = s.startsWith('[:', start);
    let headStart;
    if (generic) {
      headStart = start + 2;
    } else {
      m = this.match(SHORT_START_RE);
      if (!m || !(SHORT_ATOMIC.has(m[1]) || SHORT_BLOCK.has(m[1]))) return null;
      headStart = start + 1;
    }

    const end = this.headEnd(headStart, start);
    const rawHead = s.slice(headStart, end);
    // 只有通用写法把 /] 当作自闭合终止符；短标签末尾的 / 属于位置参数内容。
    const isVoid = generic && rawHead.endsWith('/');
    const head = isVoid ? rawHead.slice(0, -1) : rawHead;
    const nm = NAME_RE.exec(head);
    if (!nm) this.error('E_NAME', '缺少或非法的元素名称', start);
    const name = nm[0];
    const rest = head.slice(name.length);
    if (!generic && SHORT_BLOCK.has(name) && rest === '/') {
      this.error('E_SHORT_CLOSE', '容器简写必须写出结束标签', start);
    }
    if (rest && !WS.includes(rest[0])) {
      this.error('E_ATTR', '元素名称后必须使用空白', start);
    }
    if (generic) {
      const attrs = this.attributes(rest, null, start);
      return { kind: isVoid ? 'void' : 'open', name, attrs, start, end: end + 1 };
    }
    if (!(SHORT_ATOMIC.has(name) || SHORT_BLOCK.has(name))) {
      this.error('E_NAME', `未登记的简写 ${name}`, start);
    }
    if (name === 'code' && trimWS(rest) === 'raw') {
      return { kind: 'open', name: 'code', attrs: {}, start, end: end + 1, raw: true };
    }
    const attrs = this.attributes(rest, POSITIONAL[name] ?? null, start);
    const actual = name === 'ref' ? 'msg' : name;
    return {
      kind: SHORT_ATOMIC.has(name) ? 'void' : 'open',
      name: actual,
      attrs,
      start,
      end: end + 1,
    };
  }

  headEnd(begin, tagStart) {
    let inString = false;
    let at = begin;
    while (at < this.s.length) {
      const ch = this.s[at];
      if (inString && ch === '\\') {
        at += 2;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
      } else if (ch === ']' && !inString) {
        return at;
      }
      at += 1;
    }
    // 定位到标签起点，便于编辑器与报错卡片准确指出未闭合的标签。
    this.error('E_TAG', '标签或引号属性未闭合', tagStart);
  }

  attributes(rest, positionalKey, at) {
    const values = {};
    let pos = 0;
    while (pos < rest.length) {
      while (pos < rest.length && WS.includes(rest[pos])) pos += 1;
      if (pos === rest.length) break;
      let key;
      let value;
      const km = KEY_RE.exec(rest.slice(pos));
      if (km && rest[pos + km[0].length] === '=') {
        key = km[0];
        [value, pos] = this.value(rest, pos + key.length + 1, at);
      } else if (positionalKey !== null) {
        key = positionalKey;
        [value, pos] = this.value(rest, pos, at);
      } else {
        this.error('E_ATTR', '需要 name=value 形式的属性', at);
      }
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        this.error('E_ATTR_DUP', `重复属性 ${key}`, at);
      }
      values[key] = value;
      if (pos < rest.length && !WS.includes(rest[pos])) {
        this.error('E_ATTR', '属性之间必须使用结构空白分隔', at);
      }
    }
    const sorted = {};
    for (const k of Object.keys(values).sort()) sorted[k] = values[k];
    return sorted;
  }

  value(rest, pos, at) {
    if (pos >= rest.length) this.error('E_ATTR', '缺少属性值', at);
    if (rest[pos] === '"') {
      let j = pos + 1;
      while (j < rest.length) {
        if (rest[j] === '\\') {
          j += 2;
          continue;
        }
        if (rest[j] === '"') {
          j += 1;
          break;
        }
        j += 1;
      }
      let value;
      try {
        value = JSON.parse(rest.slice(pos, j));
      } catch {
        this.error('E_ATTR', '非法 JSON 引号属性值', at);
      }
      if (typeof value !== 'string' || hasUnpairedSurrogate(value)) {
        this.error('E_UNICODE', '属性值必须是 Unicode 标量值字符串', at);
      }
      return [value, j];
    }
    let end = pos;
    while (end < rest.length && !WS.includes(rest[end])) {
      if ('[]"\\'.includes(rest[end])) {
        this.error('E_ATTR', '含特殊字符的属性值必须加引号', at);
      }
      end += 1;
    }
    if (end === pos) this.error('E_ATTR', '裸属性值不得为空', at);
    return [rest.slice(pos, end), end];
  }
}

/** 解析 CQX v0.2 文本，返回正规化后的消息树。 */
export function parse(source, options = {}) {
  const { maxDepth = 64, maxNodes = 10000, maxChars = 1000000 } = options;
  if (typeof source !== 'string') throw new TypeError('CQX 输入必须是字符串');
  if (maxDepth < 0 || maxNodes < 0 || maxChars < 0) {
    throw new RangeError('资源限制不得为负数');
  }
  let utf16 = 0;
  let codePoints = 0;
  for (const ch of source) {
    if (ch.length === 1 && /[\uD800-\uDFFF]/.test(ch)) {
      throw new CQXError('E_UNICODE', '输入含未配对的代理码位', source, utf16);
    }
    utf16 += ch.length;
    codePoints += 1;
  }
  if (codePoints > maxChars) {
    throw new CQXError('E_LIMIT', `输入超过 ${maxChars} 个码点`, source, 0);
  }
  return new Parser(source, { maxDepth, maxNodes }).parse();
}

export const serialize = serializeCanonical;
