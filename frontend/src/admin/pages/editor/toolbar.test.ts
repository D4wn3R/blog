import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { applyToolbarAction, countRunes, cursorLineCol, type ToolbarAction } from './toolbar'

// 用 applyToolbarAction 前后 doc 文本断言（TransactionSpec → state.update 还原）
function apply(doc: string, sel: [number, number], action: ToolbarAction) {
  const state = EditorState.create({ doc, selection: { anchor: sel[0], head: sel[1] } })
  const next = state.update(applyToolbarAction(state, action)).state
  return {
    doc: next.doc.toString(),
    sel: [next.selection.main.from, next.selection.main.to] as const,
  }
}

describe('applyToolbarAction heading', () => {
  const tests = [
    {
      give: '光标在普通行 → 加一级标题',
      doc: '正文\n',
      sel: [0, 0] as [number, number],
      action: { kind: 'heading', level: 1 } as ToolbarAction,
      wantDoc: '# 正文\n',
    },
    {
      give: '已是 # → 切到二级',
      doc: '# 标题\n',
      sel: [2, 2] as [number, number],
      action: { kind: 'heading', level: 2 } as ToolbarAction,
      wantDoc: '## 标题\n',
    },
    {
      give: '已是该级别 → 去掉前缀',
      doc: '## 标题\n',
      sel: [3, 3] as [number, number],
      action: { kind: 'heading', level: 2 } as ToolbarAction,
      wantDoc: '标题\n',
    },
    {
      give: '多行统一加级别',
      doc: '甲\n乙\n',
      sel: [0, 4] as [number, number],
      action: { kind: 'heading', level: 2 } as ToolbarAction,
      wantDoc: '## 甲\n## 乙\n',
    },
  ]
  for (const tt of tests) {
    it(tt.give, () => {
      expect(apply(tt.doc, tt.sel, tt.action).doc).toBe(tt.wantDoc)
    })
  }
})

describe('applyToolbarAction wrap', () => {
  const tests = [
    {
      give: '空选插粗体占位并选中占位',
      doc: '',
      sel: [0, 0] as [number, number],
      action: { kind: 'wrap', token: '**', placeholder: '粗体文字' } as ToolbarAction,
      wantDoc: '**粗体文字**',
      wantSel: [2, 6] as const,
    },
    {
      give: '非空选包上粗体',
      doc: '文字',
      sel: [0, 2] as [number, number],
      action: { kind: 'wrap', token: '**', placeholder: '粗体文字' } as ToolbarAction,
      wantDoc: '**文字**',
      wantSel: [2, 4] as const,
    },
    {
      give: '已包裹 → 解除',
      doc: '**文字**',
      sel: [0, 6] as [number, number],
      action: { kind: 'wrap', token: '**', placeholder: '粗体文字' } as ToolbarAction,
      wantDoc: '文字',
      wantSel: [0, 2] as const,
    },
    {
      give: '行内码包裹',
      doc: 'code',
      sel: [0, 4] as [number, number],
      action: { kind: 'wrap', token: '`', placeholder: '代码' } as ToolbarAction,
      wantDoc: '`code`',
      wantSel: [1, 5] as const,
    },
  ]
  for (const tt of tests) {
    it(tt.give, () => {
      const r = apply(tt.doc, tt.sel, tt.action)
      expect(r.doc).toBe(tt.wantDoc)
      expect(r.sel).toEqual(tt.wantSel)
    })
  }
})

describe('applyToolbarAction line prefix', () => {
  const tests = [
    {
      give: '无前缀 → 无序列表',
      doc: '甲\n乙\n',
      sel: [0, 4] as [number, number],
      action: { kind: 'ul' } as ToolbarAction,
      wantDoc: '- 甲\n- 乙\n',
    },
    {
      give: 'ul → toggle 移除',
      doc: '- 甲\n- 乙\n',
      sel: [0, 8] as [number, number],
      action: { kind: 'ul' } as ToolbarAction,
      wantDoc: '甲\n乙\n',
    },
    {
      give: '多行选区含末尾空行 → 空行不加前缀',
      doc: '甲\n\n乙\n',
      sel: [0, 5] as [number, number],
      action: { kind: 'ul' } as ToolbarAction,
      wantDoc: '- 甲\n\n- 乙\n',
    },
    {
      give: '有序列表按行重排编号',
      doc: '甲\n乙\n丙\n',
      sel: [0, 6] as [number, number],
      action: { kind: 'ol' } as ToolbarAction,
      wantDoc: '1. 甲\n2. 乙\n3. 丙\n',
    },
    {
      give: 'task 前缀',
      doc: '待办\n',
      sel: [0, 2] as [number, number],
      action: { kind: 'task' } as ToolbarAction,
      wantDoc: '- [ ] 待办\n',
    },
    {
      give: '引用 toggle',
      doc: '甲\n',
      sel: [0, 1] as [number, number],
      action: { kind: 'quote' } as ToolbarAction,
      wantDoc: '> 甲\n',
    },
    {
      give: 'task 行切 ul 时先剥 task 前缀再加 - ',
      doc: '- [ ] 待办\n',
      sel: [0, 9] as [number, number],
      action: { kind: 'ul' } as ToolbarAction,
      wantDoc: '- 待办\n',
    },
  ]
  for (const tt of tests) {
    it(tt.give, () => {
      expect(apply(tt.doc, tt.sel, tt.action).doc).toBe(tt.wantDoc)
    })
  }
})

describe('applyToolbarAction link/image/codeblock', () => {
  const tests = [
    {
      give: '空选插链接模板并选中 url',
      doc: '',
      sel: [0, 0] as [number, number],
      action: { kind: 'link' } as ToolbarAction,
      wantDoc: '[链接文字](url)',
      wantSel: [7, 10] as const,
    },
    {
      give: '选中文本 → 进方括号选中 url',
      doc: '官网',
      sel: [0, 2] as [number, number],
      action: { kind: 'link' } as ToolbarAction,
      wantDoc: '[官网](url)',
      wantSel: [5, 8] as const,
    },
    {
      give: '空选插图片占位',
      doc: '',
      sel: [0, 0] as [number, number],
      action: { kind: 'image' } as ToolbarAction,
      wantDoc: '![](url)',
      wantSel: [4, 7] as const,
    },
    {
      give: '空行插代码块，光标落块内',
      doc: '',
      sel: [0, 0] as [number, number],
      action: { kind: 'codeblock' } as ToolbarAction,
      wantDoc: '```\n\n```\n',
      wantSel: [4, 4] as const,
    },
    {
      give: '非空行插代码块先换行',
      doc: '前文',
      sel: [2, 2] as [number, number],
      action: { kind: 'codeblock' } as ToolbarAction,
      wantDoc: '前文\n```\n\n```\n',
    },
  ]
  for (const tt of tests) {
    it(tt.give, () => {
      const r = apply(tt.doc, tt.sel, tt.action)
      expect(r.doc).toBe(tt.wantDoc)
      if (tt.wantSel) expect(r.sel).toEqual(tt.wantSel)
    })
  }
})

describe('applyToolbarAction table/hr', () => {
  it('空行插表格模板', () => {
    const r = apply('', [0, 0], { kind: 'table' })
    expect(r.doc).toBe('| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n')
  })
  it('非空行插分隔线先换行', () => {
    expect(apply('前文', [2, 2], { kind: 'hr' }).doc).toBe('前文\n---\n')
  })
})

describe('countRunes / cursorLineCol', () => {
  const tests = [
    { give: 'emoji 按 rune 计 1', s: '🐱', want: 1 },
    { give: '中文按 rune 计 1', s: '中文ab', want: 4 },
    { give: '空串', s: '', want: 0 },
  ]
  for (const tt of tests) {
    it(tt.give, () => {
      expect(countRunes(tt.s)).toBe(tt.want)
    })
  }

  it('行列为 1-based', () => {
    const state = EditorState.create({ doc: 'ab\ncd', selection: { anchor: 5 } })
    expect(cursorLineCol(state)).toEqual({ line: 2, col: 3, runes: 5 })
  })
})
