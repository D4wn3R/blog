import type { EditorState, TransactionSpec } from '@codemirror/state'

// 工具栏动作 → TransactionSpec（纯函数，可单测；经 view.dispatch 应用以保留 undo 历史）
// 参照掘金：行前缀 toggle、行内包裹、空选插占位

export type ToolbarAction =
  | { kind: 'heading'; level: 1 | 2 }
  | { kind: 'wrap'; token: '**' | '*' | '~~' | '`'; placeholder: string }
  | { kind: 'link' }
  | { kind: 'image' }
  | { kind: 'quote' }
  | { kind: 'ul' }
  | { kind: 'ol' }
  | { kind: 'task' }
  | { kind: 'codeblock' }
  | { kind: 'table' }
  | { kind: 'hr' }

interface Edit {
  from: number
  to: number
  insert: string
}

// 各类行前缀的识别（判kind优先级：task 先于 ul，防 `- [ ] x` 被当成 ul）
const HAS_PREFIX = {
  quote: /^> /,
  ul: /^- /,
  ol: /^\d+\. /,
  task: /^- \[[ xX]?\] /,
} as const

const STRIP: RegExp[] = [HAS_PREFIX.task, HAS_PREFIX.ol, HAS_PREFIX.ul, HAS_PREFIX.quote]

function lineKind(line: string): 'quote' | 'ul' | 'ol' | 'task' | null {
  if (HAS_PREFIX.task.test(line)) return 'task'
  if (HAS_PREFIX.ol.test(line)) return 'ol'
  if (HAS_PREFIX.ul.test(line)) return 'ul'
  if (HAS_PREFIX.quote.test(line)) return 'quote'
  return null
}

function stripPrefixes(line: string): string {
  let body = line
  for (const p of STRIP) body = body.replace(p, '')
  return body
}

// 所选行号范围（含首尾）。文档末尾的幻影空行（末尾 \n 之后的空行）不计入，
// 否则 Ctrl+A 全选会因空行不匹配前缀而永远无法触发 toggle 移除
function selectedLines(state: EditorState): { from: number; to: number } {
  const range = state.selection.main
  let from = state.doc.lineAt(range.from).number
  let to = state.doc.lineAt(range.to).number
  if (to > from && to === state.doc.lines && state.doc.line(to).text === '') to -= 1
  return { from, to }
}

function headingLevel(line: string): number {
  const m = /^(#{1,6}) /.exec(line)
  return m ? m[1].length : 0
}

// 标题切换：所选行全部已是该级别 → 去掉；否则统一为该级别。
// 加前缀时跳过空行（多行选区常含末尾空行），单行空选仍加（空行起手写标题）
function toggleHeading(state: EditorState, level: 1 | 2): TransactionSpec {
  const { from: lineFrom, to: lineTo } = selectedLines(state)
  const texts: string[] = []
  for (let n = lineFrom; n <= lineTo; n++) texts.push(state.doc.line(n).text)
  const remove = texts.every((l) => l !== '' && headingLevel(l) === level)

  const edits: Edit[] = []
  for (let n = lineFrom; n <= lineTo; n++) {
    const info = state.doc.line(n)
    if (!remove && info.text === '' && lineFrom !== lineTo) {
      edits.push({ from: info.from, to: info.to, insert: '' })
      continue
    }
    const body = info.text.replace(/^#{1,6} /, '')
    const insert = remove ? body : `${'#'.repeat(level)} ${body}`
    edits.push({ from: info.from, to: info.to, insert })
  }
  return { changes: edits }
}

// 列表/引用/任务切换：全部已有该前缀 → 去掉；否则剥离旧前缀后统一加上
// （有序列表按行重排编号；加前缀时跳过空行，单行空选仍加）
function toggleLinePrefix(
  state: EditorState,
  kind: 'quote' | 'ul' | 'ol' | 'task',
): TransactionSpec {
  const { from: lineFrom, to: lineTo } = selectedLines(state)
  const texts: string[] = []
  for (let n = lineFrom; n <= lineTo; n++) texts.push(state.doc.line(n).text)
  const remove = texts.every((l) => lineKind(l) === kind)

  const edits: Edit[] = []
  let seq = 0
  for (let n = lineFrom; n <= lineTo; n++) {
    const info = state.doc.line(n)
    const body = stripPrefixes(info.text)
    let insert: string
    if (remove) {
      insert = body
    } else if (body === '' && lineFrom !== lineTo) {
      insert = ''
    } else if (kind === 'quote') {
      insert = `> ${body}`
    } else if (kind === 'ul') {
      insert = `- ${body}`
    } else if (kind === 'task') {
      insert = `- [ ] ${body}`
    } else {
      insert = `${++seq}. ${body}`
    }
    edits.push({ from: info.from, to: info.to, insert })
  }
  return { changes: edits }
}

// 行内包裹（粗体/斜体/删除线/行内码）：空选插占位并选中占位；非空选已包裹 → 解除，未包裹 → 包上
function wrapSelection(state: EditorState, token: string, placeholder: string): TransactionSpec {
  const range = state.selection.main
  const text = state.doc.sliceString(range.from, range.to)
  const wrapped = text.length >= token.length * 2 && text.startsWith(token) && text.endsWith(token)

  let insert: string
  let anchor: number
  let head: number
  if (range.from === range.to) {
    insert = `${token}${placeholder}${token}`
    anchor = range.from + token.length
    head = anchor + placeholder.length
  } else if (wrapped) {
    const body = text.slice(token.length, text.length - token.length)
    insert = body
    anchor = range.from
    head = range.from + body.length
  } else {
    insert = `${token}${text}${token}`
    anchor = range.from + token.length
    head = range.from + token.length + text.length
  }
  return { changes: { from: range.from, to: range.to, insert }, selection: { anchor, head } }
}

// 链接/图片：非空选 → 选中文本进方括号、选中 url 占位；空选 → 整段占位并选中 url
function insertLinkOrImage(state: EditorState, image: boolean): TransactionSpec {
  const range = state.selection.main
  const bang = image ? '!' : ''
  const text =
    range.from === range.to
      ? image
        ? ''
        : '链接文字'
      : state.doc.sliceString(range.from, range.to)
  const insert = `${bang}[${text}](url)`
  // url 占位位于 `](` 之后 3 字符
  const urlFrom = range.from + bang.length + text.length + 3
  return {
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: urlFrom, head: urlFrom + 3 },
  }
}

// 围栏代码块：光标行非空先换行；非空选 → 包住选区；空选 → 光标落块内
function insertCodeblock(state: EditorState): TransactionSpec {
  const range = state.selection.main
  const line = state.doc.lineAt(range.from)
  const nl = line.text !== '' ? '\n' : ''
  if (range.from !== range.to) {
    const body = state.doc.sliceString(range.from, range.to)
    return { changes: { from: range.from, to: range.to, insert: `${nl}\`\`\`\n${body}\n\`\`\`\n` } }
  }
  const insert = `${nl}\`\`\`\n\n\`\`\`\n`
  return {
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + nl.length + 4 },
  }
}

// 表格模板：光标行非空先换行，光标落到模板末尾
function insertTable(state: EditorState): TransactionSpec {
  const range = state.selection.main
  const line = state.doc.lineAt(range.from)
  const nl = line.text !== '' ? '\n' : ''
  const insert = `${nl}| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n`
  return {
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + insert.length },
  }
}

// 分隔线：光标行非空先换行
function insertHr(state: EditorState): TransactionSpec {
  const range = state.selection.main
  const line = state.doc.lineAt(range.from)
  const nl = line.text !== '' ? '\n' : ''
  return { changes: { from: range.from, to: range.to, insert: `${nl}---\n` } }
}

export function applyToolbarAction(state: EditorState, action: ToolbarAction): TransactionSpec {
  switch (action.kind) {
    case 'heading':
      return toggleHeading(state, action.level)
    case 'wrap':
      return wrapSelection(state, action.token, action.placeholder)
    case 'link':
      return insertLinkOrImage(state, false)
    case 'image':
      return insertLinkOrImage(state, true)
    case 'quote':
    case 'ul':
    case 'ol':
    case 'task':
      return toggleLinePrefix(state, action.kind)
    case 'codeblock':
      return insertCodeblock(state)
    case 'table':
      return insertTable(state)
    case 'hr':
      return insertHr(state)
  }
}

// rune 计数（与后端 minutes 的 utf8.RuneCountInString 口径一致）
export function countRunes(s: string): number {
  return [...s].length
}

// 状态栏 行:列（1-based）与 rune 字数
export function cursorLineCol(state: EditorState): { line: number; col: number; runes: number } {
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  return { line: line.number, col: head - line.from + 1, runes: countRunes(state.doc.toString()) }
}
