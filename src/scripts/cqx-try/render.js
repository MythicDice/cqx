/* CQX 富文本渲染器
 * 只通过 DOM API 构建节点，不拼接 innerHTML；图片与链接的 src/href 经过白名单校验。
 * 回复（reply）与引用（原子 msg / 原子 forward）无论写在什么位置，
 * 都会提取到所属消息的最开头，按 QQ 的引用条样式呈现。
 */

// 站点部署在子路径时（GitHub Pages 的 /cqx/），把站内绝对路径补上 base。
const BASE_URL = import.meta.env?.BASE_URL ?? '/';

function withBase(path) {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const base = BASE_URL.replace(/\/$/, '');
  if (!base || path === base || path.startsWith(`${base}/`)) return path;
  return `${base}${path}`;
}

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/* face.set 选择的表情集。同一个 id 在不同表情集里对应不同表情；
 * 未登记的名称回退默认集，不改动消息树里的原始 set 值。
 */
const FACE_SETS = {
  default: [
    '😀', '😄', '😁', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍',
    '😘', '😋', '😜', '🤔', '😐', '😴', '😎', '🥳', '😕', '😢',
    '😭', '😠', '👍', '👏', '🙏', '💪', '🎉', '❤️', '🌹', '🐱',
  ],
  qq: [
    '😌', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
    '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
    '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
  ],
  animal: [
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
    '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧',
    '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐴', '🦄', '🐝',
  ],
  gesture: [
    '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
    '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏',
    '💪', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🫶',
  ],
};

/** 按表情集解析编号；非数字编号返回 null，由渲染器显示为可读标签。 */
export function faceGlyph(id, set) {
  const list = typeof set === 'string' && Object.hasOwn(FACE_SETS, set)
    ? FACE_SETS[set]
    : FACE_SETS.default;
  const raw = String(id ?? '');
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? list[n % list.length] : null;
}

/** 引用型元素：reply 是回复，原子 msg 是 [ref]，原子 forward 是引用已有转发。 */
function isQuote(node) {
  return node.type === 'element' && (
    node.name === 'reply' ||
    (node.name === 'msg' && node.mode === 'void') ||
    (node.name === 'forward' && node.mode === 'void')
  );
}

/** 把引用型节点从正文里分离出来；仅整理残留空白，不改动非空白文本。 */
function splitQuotes(nodes) {
  const quotes = [];
  const body = [];
  for (const node of nodes) {
    if (isQuote(node)) quotes.push(node);
    else body.push(node);
  }
  if (!quotes.length) return { quotes, body: nodes };

  const merged = [];
  for (const node of body) {
    if (node.type === 'text') {
      const last = merged[merged.length - 1];
      if (last && last.type === 'text') {
        last.text += node.text;
        continue;
      }
      merged.push({ type: 'text', text: node.text });
    } else {
      merged.push(node);
    }
  }
  for (const node of merged) {
    if (node.type === 'text') {
      node.text = node.text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    }
  }
  if (merged.length && merged[0].type === 'text') {
    merged[0].text = merged[0].text.replace(/^\s+/, '');
  }
  if (merged.length && merged[merged.length - 1].type === 'text') {
    merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, '');
  }
  return { quotes, body: merged.filter((n) => n.type !== 'text' || n.text.length > 0) };
}

/** 仅允许图片类 base64、http(s)、站点相对路径与 blob URL。 */
export function safeImageSrc(src) {
  if (typeof src !== 'string') return null;
  const s = src.trim();
  if (/^data:image\/(?:png|jpe?g|gif|webp|bmp|avif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(s)) {
    return s.replace(/\s+/g, '');
  }
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/(?!\/)/.test(s)) return withBase(s);
  if (/^\.{1,2}\//.test(s)) return s;
  if (/^blob:/i.test(s)) return s;
  return null;
}

function safeLinkHref(href) {
  if (typeof href !== 'string') return null;
  const s = href.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^mailto:/i.test(s)) return s;
  if (/^#/.test(s)) return s;
  if (/^\/(?!\/)/.test(s)) return withBase(s);
  if (/^\.{1,2}\//.test(s)) return s;
  return null;
}

function shortName(src) {
  if (!src) return '未命名';
  if (src.startsWith('data:')) return '内嵌数据';
  try {
    const tail = src.split(/[?#]/)[0].split('/').pop();
    return tail || src.slice(0, 40);
  } catch {
    return src.slice(0, 40);
  }
}

function imagePlaceholder(label, detail) {
  const box = el('div', 'cqx-media-fallback');
  box.appendChild(el('span', 'cqx-media-fallback-tag', '图片'));
  box.appendChild(el('span', 'cqx-media-fallback-text', label));
  if (detail) box.title = detail;
  return box;
}

function renderImage(node, stats) {
  const raw = node.attrs.src;
  const src = safeImageSrc(raw);
  if (!src) return imagePlaceholder('图片不可用', String(raw ?? ''));
  const img = el('img', 'cqx-image');
  img.alt = node.attrs.alt || 'CQX 图片';
  img.referrerPolicy = 'no-referrer';
  let settled = false;
  const fail = (reason) => {
    if (settled) return;
    settled = true;
    img.replaceWith(imagePlaceholder(`${img.alt}，${reason}`, String(raw)));
  };
  img.addEventListener('load', () => {
    settled = true;
  });
  img.addEventListener('error', () => fail('加载失败'));
  // 远程地址可能长时间无响应，超时后给出可读的占位，避免留下空白
  setTimeout(() => {
    if (!settled) fail('加载超时');
  }, 5000);
  img.src = src;
  stats.images += 1;
  return img;
}

function renderFace(node) {
  const id = node.attrs.id ?? '';
  const set = node.attrs.set;
  const glyph = faceGlyph(id, set);
  if (glyph === null) return el('span', 'cqx-chip', `表情 ${id}`);
  const cls = node.attrs.variant === 'super' ? 'cqx-face cqx-face-super' : 'cqx-face';
  const span = el('span', cls, glyph);
  span.title = set
    ? (Object.hasOwn(FACE_SETS, set)
      ? `face id=${id} set=${set}`
      : `face id=${id} set=${set}（未登记，按默认表情集显示）`)
    : `face id=${id}`;
  return span;
}

function renderAt(node) {
  const all = node.attrs.type === 'all' || node.attrs.id === 'all';
  return el('span', 'cqx-at', all ? '@全体成员' : `@${node.attrs.id ?? ''}`);
}

function renderMedia(node, kind) {
  const raw = node.attrs.src;
  const src = safeImageSrc(raw) ?? null;
  const card = el('div', 'cqx-file');
  card.appendChild(el('span', 'cqx-file-icon', kind === 'file' ? '▤' : kind === 'audio' ? '♪' : '▷'));
  const body = el('div', 'cqx-file-body');
  const name = node.attrs.name || shortName(raw);
  const meta = raw && raw.startsWith('data:') ? '内嵌数据' : shortName(raw);
  body.appendChild(el('div', 'cqx-file-name', name));
  if (meta !== name) body.appendChild(el('div', 'cqx-file-meta', meta));
  card.appendChild(body);
  if (src && kind !== 'file') {
    const player = el(kind === 'audio' ? 'audio' : 'video', 'cqx-player');
    player.controls = true;
    player.preload = 'none';
    player.src = src;
    card.appendChild(player);
  }
  return card;
}

/** 单条引用/回复条。 */
function renderQuote(node, index, total) {
  const box = el('div', 'cqx-quote');
  const attrs = node.attrs;
  let icon = '↳';
  let title = '';
  let sub = '';

  if (node.name === 'reply') {
    title = `回复 #${attrs.id ?? ''}`;
    sub = ['platform', 'account', 'channel']
      .filter((k) => attrs[k])
      .map((k) => `${k}=${attrs[k]}`)
      .join('  ');
  } else if (node.name === 'msg') {
    icon = '❝';
    title = `引用消息 #${attrs.id ?? ''}`;
  } else {
    icon = '▤';
    title = `合并转发 #${attrs.id ?? ''}`;
  }

  box.appendChild(el('span', 'cqx-quote-icon', icon));
  const body = el('div', 'cqx-quote-body');
  body.appendChild(el('div', 'cqx-quote-title', title));
  if (sub) body.appendChild(el('div', 'cqx-quote-sub', sub));
  box.appendChild(body);
  if (total > 1) box.appendChild(el('span', 'cqx-quote-index', `${index + 1}/${total}`));
  return box;
}

/** 引用区：放在消息最开头，不附加任何说明文字。 */
function renderQuotes(quotes) {
  const wrap = el('div', 'cqx-quotes');
  quotes.forEach((node, i) => wrap.appendChild(renderQuote(node, i, quotes.length)));
  return wrap;
}

function renderMsg(node, ctx) {
  const row = el('div', 'cqx-msg-row');
  const avatar = el('div', 'cqx-msg-avatar');
  const display = node.attrs.name || node.attrs.user || node.attrs.id || '?';
  avatar.textContent = String(display).slice(0, 1).toUpperCase();
  row.appendChild(avatar);
  const body = el('div', 'cqx-msg-body');
  const nameLine = el('div', 'cqx-msg-name');
  nameLine.appendChild(el('span', '',
    node.mode === 'void' ? `#${node.attrs.id ?? ''}` : String(display)));
  if (node.attrs.time) {
    nameLine.appendChild(el('span', 'cqx-msg-time', node.attrs.time));
  }
  body.appendChild(nameLine);
  const bubble = el('div', 'cqx-msg-bubble');
  if (node.mode === 'void') {
    bubble.appendChild(el('span', 'cqx-muted', '引用消息'));
  } else {
    renderMessageNodes(node.children, bubble, ctx);
  }
  body.appendChild(bubble);
  row.appendChild(body);
  return row;
}

function renderForward(node, ctx) {
  const card = el('div', 'cqx-forward');
  const head = el('div', 'cqx-forward-head');
  head.appendChild(el('span', 'cqx-forward-title', '合并转发'));
  head.appendChild(el('span', 'cqx-forward-count',
    node.mode === 'void' ? `#${node.attrs.id ?? ''}` : `${node.children.length} 条`));
  card.appendChild(head);
  if (node.mode === 'void') {
    const body = el('div', 'cqx-forward-ref');
    body.appendChild(el('span', 'cqx-muted', `#${node.attrs.id ?? ''}`));
    card.appendChild(body);
    return card;
  }
  // forward 的直接子节点都是 msg（含原子引用消息），逐条渲染，不再抽成顶部引用区。
  const list = el('div', 'cqx-forward-list');
  for (const child of node.children) {
    if (child.type === 'element' && child.name === 'msg') list.appendChild(renderMsg(child, ctx));
  }
  card.appendChild(list);
  return card;
}

function renderExtension(node, ctx) {
  const entries = Object.entries(node.attrs);
  if (!node.children.length) {
    const chip = el('span', 'cqx-ext-chip');
    chip.appendChild(el('span', 'cqx-ext-chip-name', node.name));
    for (const [k, v] of entries) {
      chip.appendChild(el('span', 'cqx-ext-chip-attr', `${k}=${v}`));
    }
    return chip;
  }
  const card = el('div', 'cqx-ext');
  const head = el('div', 'cqx-ext-head');
  head.appendChild(el('span', 'cqx-ext-name', node.name));
  card.appendChild(head);
  if (entries.length) {
    const attrs = el('div', 'cqx-ext-attrs');
    for (const [k, v] of entries) {
      attrs.appendChild(el('span', 'cqx-ext-attr', `${k}=${v}`));
    }
    card.appendChild(attrs);
  }
  if (node.children.length) {
    const body = el('div', 'cqx-ext-body');
    renderNodes(node.children, body, ctx);
    card.appendChild(body);
  }
  return card;
}

function renderElement(node, ctx) {
  const { name, attrs } = node;
  switch (name) {
    case 'at':
      return renderAt(node);
    case 'img':
      return renderImage(node, ctx.stats);
    case 'face':
      return renderFace(node);
    case 'reply': {
      // 嵌套在样式容器里的回复仍按内联引用条显示；顶层回复由 splitQuotes 置顶。
      const box = el('div', 'cqx-reply');
      box.appendChild(el('span', 'cqx-reply-mark', '↳'));
      box.appendChild(el('span', '', `回复 #${attrs.id ?? ''}`));
      for (const key of ['platform', 'account', 'channel']) {
        if (attrs[key]) box.appendChild(el('span', 'cqx-reply-scope', `${key}=${attrs[key]}`));
      }
      return box;
    }
    case 'b': {
      const n = el('strong', 'cqx-strong');
      renderNodes(node.children, n, ctx);
      return n;
    }
    case 'i': {
      const n = el('em', 'cqx-em');
      renderNodes(node.children, n, ctx);
      return n;
    }
    case 'code': {
      const onlyText = node.children.length === 1 && node.children[0].type === 'text';
      const multiline = onlyText && node.children[0].text.includes('\n');
      const n = el(multiline ? 'pre' : 'code', multiline ? 'cqx-code-block' : 'cqx-code');
      renderNodes(node.children, n, ctx);
      return n;
    }
    case 'link': {
      const href = safeLinkHref(attrs.href);
      const n = href ? el('a', 'cqx-link') : el('span', 'cqx-link cqx-link-blocked');
      if (href) {
        n.href = href;
        n.target = '_blank';
        n.rel = 'noopener noreferrer';
      } else {
        n.title = '链接来源被拦截';
      }
      renderNodes(node.children, n, ctx);
      return n;
    }
    case 'forward':
      return renderForward(node, ctx);
    case 'msg':
      return renderMsg(node, ctx);
    case 'audio':
    case 'video':
    case 'file':
      return renderMedia(node, name);
    default:
      return renderExtension(node, ctx);
  }
}

function renderNodes(nodes, parent, ctx) {
  for (const node of nodes) {
    if (node.type === 'text') {
      parent.appendChild(document.createTextNode(node.text));
      ctx.stats.texts += 1;
    } else {
      parent.appendChild(renderElement(node, ctx));
      ctx.stats.elements += 1;
    }
  }
}

/** 一条消息的内容：引用永远在最前，随后才是正文。 */
function renderMessageNodes(nodes, parent, ctx) {
  const { quotes, body } = splitQuotes(nodes);
  if (quotes.length) parent.appendChild(renderQuotes(quotes));
  renderNodes(body, parent, ctx);
  return quotes.length;
}

/** 把解析结果渲染进 container，返回统计信息。 */
export function renderDocument(nodes, container) {
  const ctx = { stats: { elements: 0, images: 0, texts: 0, quotes: 0 } };
  ctx.stats.quotes = renderMessageNodes(nodes, container, ctx);
  return ctx.stats;
}
