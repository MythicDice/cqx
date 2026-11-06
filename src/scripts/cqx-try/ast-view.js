/* AST 树视图：把消息节点树渲染成可折叠的结构化列表。
 * 全程使用 DOM API 与 textContent，不拼接 HTML。
 */

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

function preview(value, max = 72) {
  const s = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function summarizeAst(nodes) {
  const counts = { total: 0, elements: 0, texts: 0, images: 0, quotes: 0 };
  const walk = (list) => {
    for (const node of list) {
      counts.total += 1;
      if (node.type === 'text') {
        counts.texts += 1;
        continue;
      }
      counts.elements += 1;
      if (node.name === 'img') counts.images += 1;
      if (node.name === 'reply' ||
          (node.name === 'msg' && node.mode === 'void') ||
          (node.name === 'forward' && node.mode === 'void')) counts.quotes += 1;
      walk(node.children);
    }
  };
  walk(nodes);
  return counts;
}

function createNode(node, path) {
  const wrap = el('div', 'ast-node');
  const head = el('div', 'ast-head');
  const isText = node.type === 'text';
  const children = isText ? [] : node.children;
  const attrs = isText ? [] : Object.entries(node.attrs);
  const hasDetail = children.length > 0 || attrs.length > 0;

  head.appendChild(el('span', 'ast-toggle', hasDetail ? '▾' : ''));
  head.appendChild(el('span', isText ? 'ast-kind ast-kind-text' : 'ast-kind', isText ? '文本' : '元素'));

  if (isText) {
    const value = el('span', 'ast-text-value', `"${preview(node.text)}"`);
    value.title = node.text;
    head.appendChild(value);
  } else {
    head.appendChild(el('span', 'ast-name', node.name));
    head.appendChild(el('span', 'ast-mode', node.mode));
    if (attrs.length) head.appendChild(el('span', 'ast-count', `${attrs.length} 属性`));
    if (children.length) head.appendChild(el('span', 'ast-count', `${children.length} 子节点`));
  }
  head.appendChild(el('span', 'ast-path', path));
  wrap.appendChild(head);

  if (hasDetail) {
    const detail = el('div', 'ast-children');
    for (const [key, value] of attrs) {
      const row = el('div', 'ast-attr');
      row.appendChild(el('span', 'ast-attr-key', key));
      row.appendChild(el('span', 'ast-attr-eq', '='));
      const shown = el('span', 'ast-attr-val', `"${preview(value)}"`);
      shown.title = value;
      row.appendChild(shown);
      detail.appendChild(row);
    }
    children.forEach((child, i) => detail.appendChild(createNode(child, `${path}.children[${i}]`)));
    wrap.appendChild(detail);
    head.addEventListener('click', () => {
      detail.hidden = !detail.hidden;
      head.querySelector('.ast-toggle').textContent = detail.hidden ? '▸' : '▾';
    });
  }
  return wrap;
}

/** 渲染整棵消息树。 */
export function buildAstTree(nodes, container) {
  container.replaceChildren();
  const counts = summarizeAst(nodes);
  const root = el('div', 'ast-tree-root');
  const head = el('div', 'ast-root-head');
  head.appendChild(el('span', 'ast-root-mark', '▾'));
  head.appendChild(el('span', 'ast-root-title', 'document'));
  head.appendChild(el('span', 'ast-root-meta',
    `${nodes.length} 个顶层节点，${counts.elements} 个元素，${counts.texts} 段文本`));
  root.appendChild(head);
  const list = el('div', 'ast-children');
  nodes.forEach((node, i) => list.appendChild(createNode(node, `document[${i}]`)));
  root.appendChild(list);
  head.addEventListener('click', () => {
    list.hidden = !list.hidden;
    head.querySelector('.ast-root-mark').textContent = list.hidden ? '▸' : '▾';
  });
  container.appendChild(root);
}

/** 供状态栏与工具栏使用的简短统计，零值项不显示。 */
export function astSummaryText(nodes) {
  const c = summarizeAst(nodes);
  const parts = [`${c.elements} 个元素`, `${c.texts} 段文本`];
  if (c.images) parts.push(`${c.images} 张图片`);
  if (c.quotes) parts.push(`${c.quotes} 条引用`);
  return parts.join('，');
}
