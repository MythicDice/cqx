import { EditorView, basicSetup } from 'codemirror';
import { serializeCanonical, VERSION } from './parser.js';
import { checkSource } from './check.js';
import { renderDocument } from './render.js';
import { EXAMPLES, ERROR_EXAMPLES } from './examples.js';
import {
  cqxExtensions,
  setEditorError,
  clearEditorError,
  locateEditorError,
} from './editor.js';
import { buildAstTree, astSummaryText } from './ast-view.js';
import { describeError, buildDiagnosisCard, buildCompactError } from './diagnostics.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const editorHost = $('#editor');
const exampleBar = $('#examples');
const statusDot = $('#status-dot');
const statusText = $('#status-text');
const charCount = $('#char-count');
const bubble = $('#bubble');
const chatSurface = $('#chat-surface');
const previewPane = $('#preview-pane');
const previewError = $('#preview-error');
const astPane = $('#ast-pane');
const astToolbar = $('#ast-toolbar');
const astSummary = $('#ast-summary');
const astTree = $('#ast-tree');
const astJson = $('#ast-json');
const astError = $('#ast-error');
const canonicalPane = $('#canonical-pane');
const canonicalText = $('#canonical-text');
const canonicalError = $('#canonical-error');
const tabs = Array.from(document.querySelectorAll('.pane-tab'));
const astSwitchButtons = Array.from(document.querySelectorAll('.ast-switch-btn'));

if (!editorHost || !bubble || !previewError || !astTree) {
  throw new Error('在线尝试页面缺少必要的容器节点');
}

const params = new URLSearchParams(location.search);
const requestedEx = Number(params.get('ex'));
const requestedErr = Number(params.get('err'));
const validEx = Number.isInteger(requestedEx) &&
  requestedEx >= 1 && requestedEx <= EXAMPLES.length;
const validErr = Number.isInteger(requestedErr) &&
  requestedErr >= 1 && requestedErr <= ERROR_EXAMPLES.length;
const initialEx = validEx ? requestedEx - 1 : 0;
const initialErr = validErr ? requestedErr - 1 : -1;
const initialKey = validErr ? `err${initialErr}` : `ex${initialEx}`;
const initialDoc = validErr ? ERROR_EXAMPLES[initialErr].code : EXAMPLES[initialEx].code;
const initialTab = ['ast', 'canonical'].includes(params.get('view'))
  ? params.get('view')
  : 'preview';

let renderTimer;
let loadingExample = false;
let astView = 'tree';
let currentError = null;
let lastJson = '';

const view = new EditorView({
  doc: initialDoc,
  extensions: [
    basicSetup,
    ...cqxExtensions,
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      if (!loadingExample) {
        clearExampleParam();
        setActiveExample(null);
      }
      scheduleRender();
    }),
  ],
  parent: editorHost,
});

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderNow, 60);
}

function setStatus(kind, message) {
  statusDot.className = `status-dot ${kind}`;
  statusText.textContent = message;
}

function setActiveExample(key) {
  Array.from(exampleBar.children).forEach((btn) => {
    btn.classList.toggle('is-active', key !== null && btn.dataset.index === key);
  });
}

function clearExampleParam() {
  const url = new URL(location.href);
  if (!['ex', 'err', 'demo'].some((name) => url.searchParams.has(name))) return;
  for (const name of ['ex', 'err', 'demo']) url.searchParams.delete(name);
  history.replaceState(null, '', url);
}

function setTab(name) {
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  previewPane.hidden = name !== 'preview';
  astPane.hidden = name !== 'ast';
  canonicalPane.hidden = name !== 'canonical';
}

function setAstView(name) {
  astView = name;
  astSwitchButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.astView === name);
  });
  const inError = currentError !== null;
  astTree.hidden = inError || name !== 'tree';
  astJson.hidden = inError || name !== 'json';
}

/** 用一段新文本替换编辑器内容（修复、正确写法、清空共用）。 */
function replaceDocument(text) {
  loadingExample = true;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: { anchor: 0 },
  });
  loadingExample = false;
  clearExampleParam();
  setActiveExample(null);
  clearTimeout(renderTimer);
  renderNow();
}

/** 示例与错例共用：只是填入文本，之后的检查全部交给真实解析器。 */
function loadDocument(text, key, param, value) {
  loadingExample = true;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: { anchor: 0 },
  });
  loadingExample = false;
  setActiveExample(key);
  const url = new URL(location.href);
  url.searchParams.delete('ex');
  url.searchParams.delete('err');
  url.searchParams.delete('demo');
  url.searchParams.set(param, String(value));
  history.replaceState(null, '', url);
  clearTimeout(renderTimer);
  renderNow();
}

function showSuccess(doc, src) {
  renderDocument(doc, bubble);
  lastJson = JSON.stringify(doc, null, 2);
  buildAstTree(doc, astTree);
  astJson.textContent = lastJson;
  canonicalText.textContent = serializeCanonical(doc);
  const summary = astSummaryText(doc);
  astSummary.textContent = summary;

  currentError = null;
  clearEditorError(view);

  chatSurface.hidden = false;
  previewError.hidden = true;
  astToolbar.hidden = false;
  astError.hidden = true;
  canonicalText.hidden = false;
  canonicalError.hidden = true;
  setAstView(astView);

  setStatus('ok', `解析成功，${summary}（v${VERSION}）`);
  charCount.textContent = `${Array.from(src).length} 码点`;
}

function showFailure(error, src) {
  const diagnosis = describeError(error, src);
  const hasPosition = Number.isFinite(error?.utf16Offset);
  const pos = hasPosition ? error.utf16Offset : 0;
  currentError = { diagnosis, pos, hasPosition };

  if (hasPosition) {
    setEditorError(view, pos);
  } else {
    clearEditorError(view);
  }

  const handlers = {
    onLocate: () => locateEditorError(view, pos),
    onApplyFix: (text) => replaceDocument(text),
    onLoadExample: (code) => replaceDocument(code),
  };
  previewError.replaceChildren(buildDiagnosisCard(diagnosis, handlers));
  const showFull = () => setTab('preview');
  astError.replaceChildren(buildCompactError(diagnosis, showFull));
  canonicalError.replaceChildren(buildCompactError(diagnosis, showFull));

  chatSurface.hidden = true;
  previewError.hidden = false;
  astToolbar.hidden = true;
  astTree.hidden = true;
  astJson.hidden = true;
  astError.hidden = false;
  canonicalText.hidden = true;
  canonicalError.hidden = false;

  const where = diagnosis.location
    ? `第 ${diagnosis.location.line} 行第 ${diagnosis.location.column} 列`
    : '结构校验阶段';
  setStatus('error', `${diagnosis.code} ${where}：${diagnosis.title}`);
  charCount.textContent = `${Array.from(src).length} 码点`;
}

function renderNow() {
  const src = view.state.doc.toString();
  bubble.replaceChildren();
  previewError.replaceChildren();
  astTree.replaceChildren();
  astJson.textContent = '';
  astError.replaceChildren();
  canonicalText.textContent = '';
  canonicalError.replaceChildren();
  const result = checkSource(src);
  if (result.ok) showSuccess(result.doc, src);
  else showFailure(result.error, src);
}

const countLabel = document.querySelector('.examples-count');
if (countLabel) {
  countLabel.textContent = `示例 ${EXAMPLES.length}，错例 ${ERROR_EXAMPLES.length}`;
}

EXAMPLES.forEach((example, index) => {
  const btn = el('button', 'ex-btn');
  btn.type = 'button';
  btn.dataset.index = `ex${index}`;
  btn.appendChild(el('span', 'ex-num', String(index + 1)));
  btn.appendChild(el('span', 'ex-label', example.label));
  btn.addEventListener('click', () =>
    loadDocument(example.code, `ex${index}`, 'ex', index + 1));
  exampleBar.appendChild(btn);
});

exampleBar.appendChild(el('div', 'examples-break'));

ERROR_EXAMPLES.forEach((example, index) => {
  const btn = el('button', 'ex-btn ex-btn-error');
  btn.type = 'button';
  btn.dataset.index = `err${index}`;
  btn.appendChild(el('span', 'ex-num', '!'));
  btn.appendChild(el('span', 'ex-label', example.label));
  btn.addEventListener('click', () =>
    loadDocument(example.code, `err${index}`, 'err', index + 1));
  exampleBar.appendChild(btn);
});

tabs.forEach((tab) => {
  tab.addEventListener('click', () => setTab(tab.dataset.tab));
});

astSwitchButtons.forEach((btn) => {
  btn.addEventListener('click', () => setAstView(btn.dataset.astView));
});

$('#copy-ast-btn').addEventListener('click', async (event) => {
  const btn = event.currentTarget;
  if (!lastJson) return;
  try {
    await navigator.clipboard.writeText(lastJson);
    btn.textContent = '已复制';
    setTimeout(() => { btn.textContent = '复制 JSON'; }, 1500);
  } catch {
    btn.textContent = '复制失败';
    setTimeout(() => { btn.textContent = '复制 JSON'; }, 1500);
  }
});

$('#clear-btn').addEventListener('click', () => replaceDocument(''));

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    clearTimeout(renderTimer);
    renderNow();
  }
});

const clock = new Date();
const hhmm = `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`;
document.querySelectorAll('[data-clock]').forEach((node) => {
  node.textContent = node.classList.contains('chat-time') ? `今天 ${hhmm}` : hhmm;
});

setActiveExample(initialKey);
setTab(initialTab);
renderNow();
