/* 解析错误的诊断知识库与教学式报错卡片。
 * 目标：把冷冰冰的 E_* 诊断码讲清楚 —— 发生了什么、错在哪一行哪一列、
 * 规则为什么这样定、可以怎么改、正确写法长什么样，并尽量给出可一键应用的修复。
 * 所有内容通过 DOM API 与 textContent 构建，不使用 innerHTML。
 */

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const FRIENDLY = '这类问题通常只差一个符号。下面标出了位置、说明了规则，并给出可以直接照抄的写法。';

const CATALOG = {
  E_TAG: {
    title: '标签没有写完',
    summary: '解析器读到了 `[`，但一直没有找到与之配对的 `]`；也可能引号属性少了一个结束引号。',
    rule: '消息元素以 `[` 开始，到第一个不在引号内的 `]` 结束。引号值必须用成对的双引号包住，值内部的双引号要用反斜杠转义。',
    lesson: '所以 `[` 之后的 `]` 才算标签结束；只要引号没闭合，后面再多 `]` 也会被当作值的一部分。',
    suggestions: [
      '补上标签结尾的 `]`',
      '检查双引号是否成对',
      '值里若含双引号，用反斜杠转义',
    ],
    example: { label: '完整的图片标签', code: '[img "cat.png" alt="一只猫"]' },
  },
  E_NAME: {
    title: '元素名不被认识',
    summary: '这里要么缺少元素名，要么用了一个未登记的简写。',
    rule: 'v0.4 的简写表是固定的：`at`、`img`、`face`、`reply`、`ref`、`poke`、`b`、`i`、`code`、`link`、`msg`、`forward`、`file`、`audio`、`video`；`code` 与 `raw` 另有原样围栏写法。其他元素一律使用通用写法 `[:名称 属性=值/]`。元素名以字母开头，可含字母、数字、下划线、点与连字符。',
    lesson: '固定简写表让「`[note]`」这类普通方括号文本可以原样保留，同时也让未知元素有唯一的写法。',
    suggestions: [
      '把未知简写改成 `[:名称 ...]` 通用写法',
      '检查简写是否拼写正确、是否以字母开头',
      '只是想显示方括号文本的话，写成 `\\[`',
    ],
    example: { label: '自定义元素的通用写法', code: '[:vendor.card title="自定义卡片"/]' },
  },
  E_ATTR: {
    title: '属性写法不对',
    summary: '属性值或属性分隔方式不符合 CQX 的属性规则。',
    rule: '属性写作 `name=value`。裸值不能含结构空白、`[`、`]`、双引号或反斜杠；含这些字符时必须写成 JSON 双引号字符串。简写元素的第一个位置参数对应固定属性名（`img`→`src`、`reply`→`id` 等），属性之间用一个空白分隔。',
    lesson: '例如 URL 里的 `=` 与 `&` 是裸值允许的字符，而带空格的文件名必须加引号。',
    suggestions: [
      '给含空格或特殊字符的值加上双引号',
      '用 `key=value` 明确写出属性名',
      '检查两个属性之间是否留了空白',
    ],
    example: { label: '带空格的文件名', code: '[img "a b.png" alt="带空格的文件名"]' },
  },
  E_ATTR_DUP: {
    title: '同一个属性写了两次',
    summary: '元素里出现了重复的属性名，通常是位置参数与命名属性撞在了一起。',
    rule: '一个元素的每个属性名只能出现一次。简写的位置参数会被翻译成对应的属性名，因此 `[img "a.png" src="b.png"]` 等价于写了两次 `src`。',
    lesson: '需要精确控制属性时，改用通用写法，把每个属性名都写清楚。',
    suggestions: [
      '删掉重复的那一个属性',
      '或者全部改成 `[:名称 属性=值/]` 通用写法',
    ],
    example: { label: '只写一次 src', code: '[:img src="cat.png"/]' },
  },
  E_CLOSE: {
    title: '结束标签没对上',
    summary: '容器元素的开始标签与结束标签不匹配，或者出现了多余的结束标签。',
    rule: '容器元素必须用同名结束标签闭合，例如 `[b]…[/b]`。`[/名称]` 只能关闭离它最近的那个尚未闭合的容器。原子元素（如 `img`、`face`）不写结束标签。',
    lesson: '解析器按栈匹配标签，所以嵌套时先关内层、再关外层；结束标签的名字必须和开始标签完全一致。',
    suggestions: [
      '补上缺失的 `[/名称]`',
      '把结束标签改成与开始标签同名',
      '删掉多余的 `[/名称]`',
    ],
    example: { label: '正确闭合的容器', code: '[b]加粗文字[/b]' },
  },
  E_SHORT_CLOSE: {
    title: '容器简写不能自闭合',
    summary: '简写的容器元素写成了 `/]`，但简写只支持显式结束标签。',
    rule: '`/]` 自闭合只在通用写法里有效：`[:名称 属性=值/]`。简写的容器元素必须写成 `[b]内容[/b]` 这样的成对形式。',
    lesson: '这条限制让简写保持「所见即所得」，也让标签边界在任何编辑器里都一眼可见。',
    suggestions: [
      '改成 `[名称]内容[/名称]`',
      '或改用 `[:名称/]` 通用自闭合写法',
    ],
    example: { label: '成对的容器简写', code: '[b]加粗[/b]' },
  },
  E_PARENT: {
    title: '元素放错了位置',
    summary: '元素出现在了不允许它的父节点里。',
    rule: '`msg` 只能作为 `forward` 的直接子节点；`forward` 的子节点只能是 `msg`，其余内容只能是排版空白（空格、制表符、换行）。',
    lesson: '合并转发是一组消息的容器，所以它的直接子节点必须是逐条消息，而不是散落的正文。',
    suggestions: [
      '把 `[msg]` 放进 `[forward]…[/forward]` 里',
      '不要在 `forward` 内直接写正文',
      '想引用已有消息，在转发里写 `[ref 编号]`',
    ],
    example: { label: '最简合并转发', code: '[forward][msg user=10001]你好[/msg][/forward]' },
  },
  E_SCHEMA: {
    title: '元素缺少必需属性或结构不对',
    summary: '元素本身合法，但它的属性或原子／容器形式不符合内置元素的规定。',
    rule: '内置元素有固定的属性要求：`img`、`file`、`audio`、`video` 需要 `src`；`face`、`reply`、`ref`、`poke` 需要 `id`；`link` 需要 `href`；`at` 需要非空 `id` 或 `type=all`，简写 `[at all]` 表示全体成员，ID 字面值 all 使用 `[:at id="all"/]`；`face` 的 `set` 与 `variant`、`poke` 的 `variant` 写出时必须是非空字符串；`poke` 使用原子模式；容器 `forward` 至少包含一条 `msg`；容器 `msg` 需要 `user` 或 `name`；`code` 只能包含纯文本子节点；`msg` 的 `time` 必须是带时区的 RFC 3339 时间戳。',
    lesson: '解析器在生成消息树时会逐项检查这些约束，避免把残缺元素传递到后续环节。',
    suggestions: [
      '补上诊断信息里点名的必需属性',
      '确认元素该用原子形式还是容器形式',
      '检查 `msg` 的 `time` 是否形如 `2026-11-06T09:30:00+08:00`',
    ],
    example: { label: '带必需属性的图片', code: '[img "cat.png"]' },
  },
  E_RAW_CLOSE: {
    title: '原样围栏没有结束标记',
    summary: '`[code]` 或 `[raw]` 之后一直没有遇到完全匹配的结束围栏。',
    rule: '`[code#]…[/code#]` 之间的内容按字面读取，内部的 `[at …]`、`[img …]` 完整保留为正文。结束围栏的名称与 `#` 数量必须和开始围栏完全一致；正文里出现 `[/code]` 时，把开始与结束围栏都加一个 `#`。',
    lesson: '结束围栏不受反斜杠影响，加长 `#` 数量即可避开正文里的字面标记。v0.2 的 `[code raw]` 仍可用，它用 `\\[/code]` 表示字面关闭标记。',
    suggestions: [
      '补上与开始围栏完全一致的结束围栏',
      '正文含字面 `[/code]` 时，把围栏写成 `[code#]…[/code#]`',
    ],
    example: { label: '完整的原样围栏', code: '[code]print("[at all]")[/code]' },
  },
  E_UNICODE: {
    title: '文本里有不完整的字符',
    summary: '输入包含落单的代理码位，无法构成合法的 Unicode 标量值序列。',
    rule: 'CQX 的正文与属性值必须是 Unicode 标量值序列；成对的代理项（如部分 emoji）是合法的，单独出现的高／低代理项不合法。',
    lesson: '这通常来自编码转换或截断的字符串，重新以 UTF-8 粘贴即可。',
    suggestions: [
      '删除或替换该字符',
      '重新以 UTF-8 编码粘贴文本',
    ],
    example: null,
  },
  E_LIMIT: {
    title: '超出解析资源上限',
    summary: '输入长度、节点数量或嵌套深度超过了解析器的安全预算。',
    rule: '默认限制为 1,000,000 个码点、10,000 个节点、64 层嵌套。',
    lesson: '资源预算用于避免异常输入造成浏览器长时间无响应。',
    suggestions: [
      '把消息拆成几条',
      '减少容器嵌套层数',
    ],
    example: null,
  },
  E_AST: {
    title: '消息树结构不合法',
    summary: '解析出的节点树不符合 CQX 的数据模型。',
    rule: '消息树由 `text` 与 `element` 两类节点组成；元素的 `attrs` 是属性名到字符串的映射，`mode` 只能是 `void` 或 `block`。',
    lesson: '严格模式下不满足模型的节点会被拒绝，而不是被悄悄丢弃。',
    suggestions: [
      '检查元素是否缺少结束标签',
      '确认属性都写成了字符串值',
    ],
    example: null,
  },
  E_UNKNOWN: {
    title: '解析未能完成',
    summary: '解析器抛出了一个未归类的错误。',
    rule: 'CQX v0.4 沿用 v0.2 的诊断码：`E_TAG`、`E_NAME`、`E_ATTR`、`E_ATTR_DUP`、`E_CLOSE`、`E_SHORT_CLOSE`、`E_PARENT`、`E_SCHEMA`、`E_RAW_CLOSE`、`E_UNICODE`、`E_LIMIT`。',
    lesson: '可以先对照原始诊断信息，或清空后从示例重新开始。',
    suggestions: ['清空编辑器，从一键填入示例重新开始'],
    example: null,
  },
};

function appendRich(parent, value) {
  const parts = String(value).split(/(`[^`]+`)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('`') && part.endsWith('`')) {
      parent.appendChild(el('code', 'diag-code', part.slice(1, -1)));
    } else {
      parent.appendChild(document.createTextNode(part));
    }
  }
}

function countQuotes(value) {
  let n = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '\\') {
      i += 1;
      continue;
    }
    if (value[i] === '"') n += 1;
  }
  return n;
}

/** 针对具体诊断文本给出更精准的建议，并在可靠时生成可一键应用的修复。 */
function refine(code, detail, error, source) {
  const out = { suggestions: [], example: null, fix: null };
  const at = Number.isFinite(error?.utf16Offset) ? error.utf16Offset : source.length;

  if (code === 'E_CLOSE') {
    let m = /期望 \[\/([^\]]+)\]，实际为 \[\/([^\]]+)\]/.exec(detail);
    if (m) {
      const [, expected, actual] = m;
      out.suggestions.push(`把出错处的 \`[/${actual}]\` 改成 \`[/${expected}]\``);
      const token = `[/${actual}]`;
      if (source.startsWith(token, at)) {
        out.fix = {
          label: `改为 [/${expected}]`,
          text: source.slice(0, at) + `[/${expected}]` + source.slice(at + token.length),
        };
      }
    }
    m = /缺少结束标签 \[\/([^\]]+)\]/.exec(detail);
    if (m) {
      out.suggestions.push(`在末尾补上 [\`/${m[1]}\`]`);
      out.fix = { label: `补上 [/${m[1]}]`, text: source + `[/${m[1]}]` };
    }
    m = /多余的结束标签 \[\/([^\]]+)\]/.exec(detail);
    if (m) {
      out.suggestions.push(`删掉这个多余的 [\`/${m[1]}\`]`);
      const token = `[/${m[1]}]`;
      if (source.startsWith(token, at)) {
        out.fix = { label: `删除 [/${m[1]}]`, text: source.slice(0, at) + source.slice(at + token.length) };
      }
    }
    return out;
  }

  if (code === 'E_SHORT_CLOSE') {
    const m = /^\[([A-Za-z][A-Za-z0-9_.-]*)\/\]/.exec(source.slice(at));
    if (m) {
      out.suggestions.push(`把 \`[${m[1]}/]\` 改成成对的 \`[${m[1]}]…[/${m[1]}]\``);
      out.fix = {
        label: `改成 [${m[1]}]…[/${m[1]}]`,
        text: source.slice(0, at) + `[${m[1]}][/${m[1]}]` + source.slice(at + m[0].length),
      };
    }
    return out;
  }

  if (code === 'E_RAW_CLOSE') {
    const m = /缺少结束围栏 (\[\/[^\]]+\])/.exec(detail);
    const closing = m ? m[1] : '[/code]';
    out.fix = { label: `补上 ${closing}`, text: source + closing };
    return out;
  }

  if (code === 'E_TAG') {
    const needQuote = countQuotes(source.slice(at)) % 2 === 1;
    out.fix = {
      label: needQuote ? '补上引号与 ]' : '补上结尾的 ]',
      text: source + (needQuote ? '"]' : ']'),
    };
    return out;
  }

  if (code === 'E_NAME') {
    const m = /未登记的简写 ([A-Za-z][A-Za-z0-9_.-]*)/.exec(detail);
    if (m) {
      out.suggestions.push(`\`[${m[1]} …]\` 不在固定简写表里，请改写成 \`[:${m[1]} …/]\``);
      out.example = { label: `把 ${m[1]} 写成通用元素`, code: `[:${m[1]} id="1"/]` };
    }
    return out;
  }

  if (code === 'E_ATTR') {
    if (detail.includes('元素名称后必须使用空白')) {
      out.suggestions.push('元素名后面要留一个空格，例如 `[img cat.png]`');
      out.example = { label: '名称与参数之间的空格', code: '[img "cat.png" alt="猫"]' };
    } else if (detail.includes('需要 name=value')) {
      out.suggestions.push('这个元素不接收位置参数，请写成 `key=value`，例如 `[:card title="标题"/]`');
      out.example = { label: '命名属性写法', code: '[:vendor.card title="标题"/]' };
    } else if (detail.includes('含特殊字符')) {
      out.suggestions.push('把值用双引号包起来，例如 `[img "a b.png"]`');
    } else if (detail.includes('属性之间必须使用结构空白')) {
      out.suggestions.push('两个属性之间加一个空格，例如 `[img "a.png" alt="猫"]`');
    } else if (detail.includes('非法 JSON 引号属性值')) {
      out.suggestions.push('引号值按 JSON 字符串书写，内部的双引号用反斜杠转义');
    } else if (detail.includes('缺少属性值')) {
      out.suggestions.push('等号后面补上值，或删掉这个多余的属性名与等号');
    }
    return out;
  }

  if (code === 'E_ATTR_DUP') {
    const m = /重复属性 ([A-Za-z_][A-Za-z0-9_.-]*)/.exec(detail);
    if (m) {
      out.suggestions.push(`保留一个 \`${m[1]}\` 即可；位置参数和命名属性不要同时写`);
      out.example = {
        label: `只保留一个 ${m[1]}`,
        code: m[1] === 'src' ? '[:img src="cat.png"/]' : `[:vendor.card ${m[1]}="值"/]`,
      };
    }
    return out;
  }

  if (code === 'E_PARENT') {
    out.example = { label: '把消息放进转发容器', code: '[forward][msg user=10001]你好[/msg][/forward]' };
    return out;
  }

  if (code === 'E_SCHEMA') {
    let m = /^(.+?) 需要非空的 (.+) 属性$/.exec(detail);
    if (m) {
      const [, name, attr] = m;
      out.suggestions.push(`给 \`${name}\` 补上 \`${attr}\` 属性`);
      const sample = {
        img: '[img "cat.png"]',
        file: '[file "report.pdf"]',
        audio: '[audio "voice.ogg"]',
        video: '[video "demo.mp4"]',
        face: '[face 14]',
        reply: '[reply 42]',
        poke: '[poke 123]',
        link: '[link https://example.org/]首页[/link]',
      }[name];
      if (sample) out.example = { label: `带 ${attr} 的 ${name}`, code: sample };
    }
    if (detail.includes('time')) {
      out.example = {
        label: '带时区的 time',
        code: '[forward][msg user=1 time="2026-11-06T09:30:00+08:00"]早[/msg][/forward]',
      };
    }
    if (detail.includes('至少需要一个 msg')) {
      out.example = { label: '至少一条消息', code: '[forward][msg user=1]你好[/msg][/forward]' };
    }
    if (detail.includes('at 必须')) {
      out.example = { label: '用户、全体与字面 ID', code: '[at 123] [at all] [:at id="all"/]' };
      out.suggestions.push('给 `at` 填写用户 ID 或 `all`，例如 `[at 123]`、`[at all]`');
    }
    if (detail.startsWith('poke')) {
      out.example = { label: '戳一戳动作', code: '[poke 123 variant=heart]' };
      out.suggestions.push('使用原子写法 `[poke 123]`，需要样式时填写非空 `variant`');
    } else if (detail.includes('set 必须是非空') || detail.includes('variant 必须是非空')) {
      const attr = detail.includes('set 必须是非空') ? 'set' : 'variant';
      out.suggestions.push(`把 \`${attr}\` 写成非空字符串，例如 \`set=qq\` 或 \`variant=super\``);
      out.example = { label: '带表情集的表情', code: '[face 14 set=qq variant=super]' };
    }
    return out;
  }

  return out;
}

function displayWidth(value) {
  let width = 0;
  for (const ch of value) width += ch.codePointAt(0) > 0x2e80 ? 2 : 1;
  return width;
}

/** 生成带行号与高亮标记的源码片段，指出具体列。 */
function buildLocation(error, source) {
  if (!Number.isFinite(error?.line) || !Number.isFinite(error?.column)) return null;
  const lines = source.split('\n');
  const index = Math.max(0, Math.min(lines.length - 1, error.line - 1));
  const text = lines[index];
  const codePoints = Array.from(text);
  const colUtf16 = codePoints.slice(0, Math.max(0, error.column - 1)).join('').length;
  const start = Math.max(0, Math.min(colUtf16, text.length));

  const utf16 = Number.isFinite(error.utf16Offset) ? error.utf16Offset : 0;
  let length = 1;
  const rest = source.slice(utf16);
  const bracket = rest.indexOf(']');
  if (bracket >= 0) length = Math.min(bracket + 1, 40);
  const end = Math.max(start + 1, Math.min(start + Math.max(1, length), text.length));
  const atEnd = start >= text.length;

  const rows = [];
  for (let n = Math.max(0, index - 1); n <= Math.min(lines.length - 1, index + 1); n += 1) {
    if (n === index) {
      rows.push({
        number: n + 1,
        isError: true,
        before: text.slice(0, start),
        mark: atEnd ? '␃' : text.slice(start, end),
        after: atEnd ? '' : text.slice(end),
      });
    } else {
      rows.push({ number: n + 1, isError: false, before: lines[n], mark: '', after: '' });
    }
  }
  return {
    line: error.line,
    column: error.column,
    offset: error.offset,
    rows,
    caret: displayWidth(text.slice(0, start)),
    eof: atEnd,
  };
}

export function describeError(error, source) {
  const code = error?.code || 'E_UNKNOWN';
  const base = CATALOG[code] || CATALOG.E_UNKNOWN;
  const detail = error?.detail || error?.message || String(error);
  const extra = refine(code, detail, error, source);
  return {
    code,
    title: base.title,
    friendly: FRIENDLY,
    summary: base.summary,
    detail,
    raw: error?.message || String(error),
    rule: base.rule,
    lesson: base.lesson,
    suggestions: [...extra.suggestions, ...base.suggestions],
    example: extra.example || base.example,
    fix: extra.fix,
    location: buildLocation(error, source),
    pathNote: error?.path ? `消息树路径：${error.path}` : null,
  };
}

function section(title) {
  const box = el('section', 'diag-section');
  box.appendChild(el('h3', 'diag-h3', title));
  return box;
}

/** 构建报错卡片。handlers: { onLocate, onApplyFix(text), onLoadExample(code) } */
export function buildDiagnosisCard(d, handlers = {}) {
  const card = el('div', 'diag');

  const head = el('div', 'diag-head');
  head.appendChild(el('span', 'diag-badge', '!'));
  const headText = el('div', 'diag-head-text');
  headText.appendChild(el('div', 'diag-title', d.title));
  headText.appendChild(el('div', 'diag-sub', d.friendly));
  head.appendChild(headText);
  const chips = el('div', 'diag-chips');
  chips.appendChild(el('span', 'diag-chip diag-chip-code', d.code));
  chips.appendChild(el('span', 'diag-chip', d.location
    ? `第 ${d.location.line} 行第 ${d.location.column} 列`
    : '结构校验阶段'));
  head.appendChild(chips);
  card.appendChild(head);

  const what = section('发生了什么');
  const whatP = el('p', 'diag-p');
  appendRich(whatP, d.summary);
  what.appendChild(whatP);
  const detailP = el('p', 'diag-detail');
  detailP.appendChild(el('span', 'diag-detail-label', '原始诊断  '));
  detailP.appendChild(document.createTextNode(d.detail));
  what.appendChild(detailP);
  if (d.pathNote) what.appendChild(el('p', 'diag-path', d.pathNote));
  card.appendChild(what);

  if (d.location) {
    const where = section('位置');
    const frag = el('div', 'diag-frag');
    for (const row of d.location.rows) {
      const line = el('div', row.isError ? 'diag-line is-error' : 'diag-line');
      line.appendChild(el('span', 'diag-ln', String(row.number)));
      const code = el('span', 'diag-src');
      if (row.before) code.appendChild(document.createTextNode(row.before));
      if (row.mark) code.appendChild(el('span', 'diag-hl', row.mark));
      if (row.after) code.appendChild(document.createTextNode(row.after));
      line.appendChild(code);
      frag.appendChild(line);
      if (row.isError) {
        const caret = el('div', 'diag-caret');
        caret.appendChild(el('span', 'diag-ln', ''));
        caret.appendChild(el('span', 'diag-src', `${' '.repeat(d.location.caret)}▲ 这里`));
        frag.appendChild(caret);
      }
    }
    where.appendChild(frag);
    where.appendChild(el('p', 'diag-note', d.location.eof
      ? '␃ 表示问题出在行尾或文本末尾，通常需要在这里补上缺失的符号。'
      : `码点偏移 ${d.location.offset}；高亮部分就是解析器停下来的位置。`));
    card.appendChild(where);
  }

  const rule = section('这条规则');
  const ruleBox = el('div', 'diag-rule');
  appendRich(ruleBox, d.rule);
  rule.appendChild(ruleBox);
  const lesson = el('p', 'diag-p diag-lesson');
  appendRich(lesson, d.lesson);
  rule.appendChild(lesson);
  card.appendChild(rule);

  const how = section('怎么改');
  const list = el('ol', 'diag-steps');
  for (const item of d.suggestions) {
    const li = el('li');
    appendRich(li, item);
    list.appendChild(li);
  }
  how.appendChild(list);
  if (d.example) {
    const box = el('div', 'diag-example');
    box.appendChild(el('div', 'diag-example-label', `正确写法：${d.example.label}`));
    box.appendChild(el('code', 'diag-example-code', d.example.code));
    how.appendChild(box);
  }
  card.appendChild(how);

  const actions = el('div', 'diag-actions');
  const locate = el('button', 'diag-btn', '在编辑器中定位');
  locate.type = 'button';
  locate.addEventListener('click', () => handlers.onLocate?.());
  actions.appendChild(locate);
  if (d.fix) {
    const apply = el('button', 'diag-btn diag-btn-primary', `应用此修复：${d.fix.label}`);
    apply.type = 'button';
    apply.addEventListener('click', () => handlers.onApplyFix?.(d.fix.text));
    actions.appendChild(apply);
  }
  if (d.example) {
    const load = el('button', 'diag-btn', '载入正确写法');
    load.type = 'button';
    load.addEventListener('click', () => handlers.onLoadExample?.(d.example.code));
    actions.appendChild(load);
  }
  card.appendChild(actions);

  const raw = el('details', 'diag-raw');
  raw.appendChild(el('summary', '', '原始诊断信息'));
  raw.appendChild(el('pre', '', d.raw));
  card.appendChild(raw);

  return card;
}

/** 在 AST / 规范化面板使用的精简错误提示。 */
export function buildCompactError(d, onLocate) {
  const box = el('div', 'diag-compact');
  box.appendChild(el('span', 'diag-chip diag-chip-code', d.code));
  const title = el('strong', '', d.title);
  box.appendChild(title);
  const p = el('p', '', d.location
    ? `第 ${d.location.line} 行第 ${d.location.column} 列，${d.detail}`
    : d.detail);
  box.appendChild(p);
  const btn = el('button', 'diag-btn', '查看完整诊断');
  btn.type = 'button';
  btn.addEventListener('click', () => onLocate?.());
  box.appendChild(btn);
  return box;
}
