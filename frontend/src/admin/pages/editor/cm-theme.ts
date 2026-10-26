import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

// CM6 赛博朋克主题：配色对齐 md-content.css 的 .md-cyber 高亮（编辑所见 ≈ C 端渲染所得）
// 色板取自 index.css @theme：void #05070d / panel #0a0f1a / neon #2ee6ff /
// pulse #ff2e88 / volt #ffd60a / ink #dbe6f5 / dim #8a97b2 / faint #525f79 / edge #1a2438

export const cyberHighlight = HighlightStyle.define([
  { tag: t.heading, color: '#2ee6ff', fontWeight: 'bold' },
  { tag: t.heading1, color: '#2ee6ff', fontWeight: 'bold', fontSize: '1.15em' },
  { tag: t.heading2, color: '#2ee6ff', fontWeight: 'bold', fontSize: '1.08em' },
  { tag: t.strong, color: '#dbe6f5', fontWeight: 'bold' },
  { tag: t.emphasis, color: '#ff7edb', fontStyle: 'italic' },
  { tag: t.strikethrough, color: '#525f79', textDecoration: 'line-through' },
  { tag: t.link, color: '#7ee787', textDecoration: 'underline' },
  { tag: t.url, color: '#525f79' },
  { tag: t.monospace, color: '#ffd60a' },
  { tag: t.quote, color: '#8a97b2', fontStyle: 'italic' },
  { tag: t.list, color: '#2ee6ff' },
  { tag: t.meta, color: '#525f79' },
  { tag: t.processingInstruction, color: '#525f79' },
  { tag: t.keyword, color: '#ff7edb' },
  { tag: t.string, color: '#7ee787' },
  { tag: t.number, color: '#ffd60a' },
  { tag: t.comment, color: '#525f79', fontStyle: 'italic' },
  { tag: t.function(t.variableName), color: '#2ee6ff' },
  { tag: t.variableName, color: '#dbe6f5' },
  { tag: t.typeName, color: '#ffd60a' },
  { tag: t.propertyName, color: '#7ee787' },
  { tag: t.atom, color: '#ffd60a' },
  { tag: t.operator, color: '#ff7edb' },
  { tag: t.punctuation, color: '#8a97b2' },
])

export const cyberTheme = EditorView.theme(
  {
    '&': {
      color: '#dbe6f5',
      backgroundColor: 'transparent',
      fontSize: '14px',
    },
    '.cm-content': {
      fontFamily: "'JetBrains Mono Variable', ui-monospace, Menlo, Consolas, monospace",
      caretColor: '#2ee6ff',
      padding: '16px 0',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#2ee6ff',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(46, 230, 255, 0.18)',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: '#3b4a66',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: '#2ee6ff',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(16, 26, 46, 0.45)',
    },
    '.cm-selectionMatch': {
      backgroundColor: 'rgba(46, 230, 255, 0.12)',
    },
    '.cm-scroller': {
      overflow: 'auto',
      lineHeight: '1.7',
    },
  },
  { dark: true },
)

export const cyberEditorExtensions = [cyberTheme, syntaxHighlighting(cyberHighlight)]
