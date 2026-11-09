/* CodeMirror 6 的 CQX 轻量语法高亮、浅色主题与实时诊断 */
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';
import { linter, lintGutter } from '@codemirror/lint';
import { tags as t } from '@lezer/highlight';
import { checkSource } from './check.js';
import { describeError } from './diagnostics.js';

const TAG_START =
  /^\[(?:@[A-Za-z0-9_.-]+\]|\/[:A-Za-z_][A-Za-z0-9_.-]*#*\]|:[A-Za-z][A-Za-z0-9_.-]*|[A-Za-z][A-Za-z0-9_.-]*#*(?=[\s/\]]))/;

const cqxLanguage = StreamLanguage.define({
  startState() {
    return { inTag: false, named: false };
  },
  token(stream, state) {
    if (!state.inTag) {
      if (stream.match(/^\\[\\[\\\\]/)) return 'cqxEscape';
      if (stream.peek() === '[') {
        if (TAG_START.test(stream.string.slice(stream.pos))) {
          stream.next();
          state.inTag = true;
          state.named = false;
          return 'cqxBracket';
        }
        stream.next();
        return null;
      }
      let consumed = false;
      while (!stream.eol() && stream.peek() !== '[' && stream.peek() !== '\\') {
        stream.next();
        consumed = true;
      }
      if (!consumed) stream.next();
      return null;
    }

    if (stream.match(/^\/?\]/)) {
      state.inTag = false;
      return 'cqxBracket';
    }
    if (stream.eatSpace()) return null;
    if (stream.peek() === '"') {
      stream.next();
      while (!stream.eol()) {
        const c = stream.next();
        if (c === '\\' && !stream.eol()) {
          stream.next();
          continue;
        }
        if (c === '"') break;
      }
      return 'cqxString';
    }
    if (stream.peek() === '=') {
      stream.next();
      return 'cqxBracket';
    }
    const word = stream.match(/^[^\s=\]"/]+/);
    if (word) {
      if (!state.named) {
        state.named = true;
        return 'cqxName';
      }
      return stream.peek() === '=' ? 'cqxAttr' : 'cqxValue';
    }
    stream.next();
    return null;
  },
  tokenTable: {
    cqxBracket: t.punctuation,
    cqxName: t.keyword,
    cqxAttr: t.atom,
    cqxString: t.string,
    cqxValue: t.variableName,
    cqxEscape: t.operator,
  },
});

const cqxHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#2c5c6b', fontWeight: '600' },
  { tag: t.atom, color: '#7a521f' },
  { tag: t.string, color: '#4f7a5e' },
  { tag: t.variableName, color: '#4f7a5e' },
  { tag: t.operator, color: '#a45a5a', fontWeight: '600' },
  { tag: t.punctuation, color: '#8a9196' },
]);

const cqxEditorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '13.5px',
      color: '#2b3036',
      backgroundColor: '#ffffff',
    },
    '.cm-scroller': {
      fontFamily:
        '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", "Noto Sans Mono CJK SC", monospace',
      lineHeight: '1.75',
      overflow: 'auto',
    },
    '.cm-content': { padding: '14px 0', caretColor: '#2c5c6b' },
    '.cm-line': { padding: '0 14px' },
    '.cm-gutters': {
      backgroundColor: '#fbfbfa',
      color: '#a7acb0',
      border: 'none',
      borderRight: '1px solid #eceeee',
    },
    '.cm-activeLine': { backgroundColor: '#f5f8f8' },
    '.cm-activeLineGutter': { backgroundColor: '#eff3f3', color: '#7c8288' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: '#dbe9ec !important',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#2c5c6b' },
    '.cm-cqx-error-line': { backgroundColor: '#fdf4f2' },
    '.cm-foldPlaceholder': {
      backgroundColor: '#eef2f4',
      border: 'none',
      color: '#7c8288',
    },
    // 诊断范围由真实解析结果给出，这里只收敛颜色与形状，避免视觉噪音。
    '.cm-lintRange-error': {
      backgroundImage: 'none',
      backgroundColor: 'transparent',
      textDecorationLine: 'underline',
      textDecorationStyle: 'wavy',
      textDecorationColor: '#c4736a',
      textUnderlineOffset: '3px',
    },
    '.cm-lint-marker-error': { opacity: '0.6' },
    '.cm-tooltip-lint': {
      border: '1px solid #ecd9d5',
      borderRadius: '7px',
      backgroundColor: '#fefafa',
      color: '#555c63',
      fontFamily: 'var(--font)',
      fontSize: '12px',
      boxShadow: '0 2px 8px rgb(23 26 29 / 6%)',
    },
    '.cm-diagnostic-error': { borderLeftColor: '#c4736a' },
    // 补全列表的内置省略号同样不用中点字符。
    '.cm-completionListIncompleteTop:before, .cm-completionListIncompleteBottom:after': {
      content: '"…"',
    },
  },
  { dark: false },
);

/* 错误定位：只给出错行一层淡红底，字符级波浪线交给 lint 诊断。 */
const setErrorLine = StateEffect.define();

const cqxErrorField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setErrorLine)) continue;
      const pos = effect.value;
      next = pos === null
        ? Decoration.none
        : Decoration.set([
          Decoration.line({ class: 'cm-cqx-error-line' }).range(pos),
        ], true);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** 在编辑器中标出解析错误所在行（utf16Offset 与源码的 UTF-16 下标一致）。 */
export function setEditorError(view, utf16Offset) {
  const length = view.state.doc.length;
  const from = Math.max(0, Math.min(utf16Offset, length));
  view.dispatch({ effects: setErrorLine.of(view.state.doc.lineAt(from).from) });
}

export function clearEditorError(view) {
  view.dispatch({ effects: setErrorLine.of(null) });
}

/** 把光标移动到错误处并滚动到可见区域。 */
export function locateEditorError(view, utf16Offset) {
  const pos = Math.max(0, Math.min(utf16Offset, view.state.doc.length));
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  view.focus();
}

/** 把解析器抛出的真实 CQXError 转成 CodeMirror 诊断。 */
function toDiagnostic(error, source, view) {
  const doc = view.state.doc;
  const length = doc.length;
  const hasPosition = Number.isFinite(error?.utf16Offset);
  const from = hasPosition
    ? Math.max(0, Math.min(error.utf16Offset, Math.max(0, length - 1)))
    : 0;
  const line = doc.lineAt(from);
  const rest = source.slice(from, line.to);
  const bracket = rest.indexOf(']');
  const span = hasPosition
    ? Math.min(40, bracket >= 0 ? bracket + 1 : Math.max(1, rest.length))
    : 1;
  const to = Math.min(length, Math.max(from + 1, from + span));

  const d = describeError(error, source);
  const diagnostic = {
    from,
    to,
    severity: 'error',
    source: 'CQX v0.4',
    message: `${d.code} ${d.title}：${d.detail}`,
  };
  if (d.fix) {
    diagnostic.actions = [{
      name: d.fix.label,
      apply(v) {
        v.dispatch({
          changes: { from: 0, to: v.state.doc.length, insert: d.fix.text },
          selection: { anchor: 0 },
        });
      },
    }];
  }
  return diagnostic;
}

/* 每次文档变更都调用严格解析器，诊断的位置、说明与修复全部来自该次解析。 */
const cqxLinter = linter((view) => {
  const src = view.state.doc.toString();
  const result = checkSource(src);
  return result.ok ? [] : [toDiagnostic(result.error, src, view)];
}, { delay: 80 });

export const cqxExtensions = [
  cqxLanguage,
  syntaxHighlighting(cqxHighlightStyle),
  cqxEditorTheme,
  cqxErrorField,
  cqxLinter,
  lintGutter(),
];
