import { afterEach, describe, expect, it } from 'vitest'
import { clearDraft, draftKey, hasRecoverableDraft, loadDraft, saveDraft } from './draft'

afterEach(() => {
  localStorage.clear()
})

describe('draft', () => {
  const tests = [
    { give: '新建无 id', id: null as string | null, wantKey: 'blog.editor-draft:new' },
    { give: '编辑 id=7', id: '7' as string | null, wantKey: 'blog.editor-draft:7' },
  ]
  for (const tt of tests) {
    it(tt.give, () => {
      expect(draftKey(tt.id)).toBe(tt.wantKey)
    })
  }

  it('保存后可读回', () => {
    saveDraft('7', '标题', '# 正文')
    expect(loadDraft('7')).toEqual({
      title: '标题',
      contentMd: '# 正文',
      savedAt: expect.any(Number),
    })
  })

  it('草稿按 id 隔离', () => {
    saveDraft('7', 'A', 'a')
    saveDraft(null, 'B', 'b')
    expect(loadDraft('7')?.title).toBe('A')
    expect(loadDraft(null)?.title).toBe('B')
  })

  it('清除后读不到', () => {
    saveDraft('7', '标题', '正文')
    clearDraft('7')
    expect(loadDraft('7')).toBeNull()
  })

  it('损坏的 JSON 按无草稿处理', () => {
    localStorage.setItem('blog.editor-draft:7', '{oops')
    expect(loadDraft('7')).toBeNull()
  })

  it('字段类型不对按无草稿处理', () => {
    localStorage.setItem('blog.editor-draft:7', JSON.stringify({ title: 1, contentMd: 2 }))
    expect(loadDraft('7')).toBeNull()
  })

  const recovery = [
    {
      give: '无草稿 → 不可恢复',
      draft: null,
      base: ['t', 'c'] as [string, string],
      want: false,
    },
    {
      give: '草稿与基准一致 → 不可恢复',
      draft: { title: 't', contentMd: 'c', savedAt: 1 },
      base: ['t', 'c'] as [string, string],
      want: false,
    },
    {
      give: '标题被改动 → 可恢复',
      draft: { title: 't2', contentMd: 'c', savedAt: 1 },
      base: ['t', 'c'] as [string, string],
      want: true,
    },
    {
      give: '正文被改动 → 可恢复',
      draft: { title: 't', contentMd: 'c2', savedAt: 1 },
      base: ['t', 'c'] as [string, string],
      want: true,
    },
    {
      give: '全空草稿 → 不可恢复',
      draft: { title: '', contentMd: '', savedAt: 1 },
      base: ['t', 'c'] as [string, string],
      want: false,
    },
  ]
  for (const tt of recovery) {
    it(tt.give, () => {
      expect(hasRecoverableDraft(tt.draft, tt.base[0], tt.base[1])).toBe(tt.want)
    })
  }
})
