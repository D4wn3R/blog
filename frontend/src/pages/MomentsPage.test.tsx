import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { MomentsPage } from './MomentsPage'
import { useMoments } from '../lib/queries'
import type { UseQueryResult } from '@tanstack/react-query'
import type { MomentDTO } from '../types/api'

// 列表页的关键约束：正文里可能有 Markdown 链接，卡片外层不能是 <a>（会嵌套出非法 HTML）
vi.mock('../lib/queries', () => ({ useMoments: vi.fn() }))
vi.mock('../lib/mermaid', () => ({ renderMermaidIn: vi.fn(() => Promise.resolve()) }))

function mockMoments(list: MomentDTO[]) {
  const result = {
    isPending: false,
    isError: false,
    data: list,
    error: null,
    refetch: vi.fn(),
  } as unknown as UseQueryResult<MomentDTO[]>
  vi.mocked(useMoments).mockReturnValue(result)
}

const _moments: MomentDTO[] = [
  {
    id: 7,
    content: '见 https://blog-manmu.top/moments/2 和 [文档](https://example.com/docs)',
    images: [],
    created_at: '2026-11-11T12:00:00+08:00',
  },
  {
    id: 8,
    content: '```go\nfmt.Println(1)\n```',
    images: [],
    created_at: '2026-11-10T12:00:00+08:00',
  },
]

function renderList() {
  return render(
    <MemoryRouter>
      <MomentsPage />
    </MemoryRouter>,
  )
}

describe('MomentsPage 卡片渲染', () => {
  it('卡片不产生嵌套 anchor，正文链接可点', () => {
    mockMoments(_moments)
    const { container } = renderList()

    expect(container.querySelectorAll('a a')).toHaveLength(0)
    expect(container.querySelector('a[href="https://blog-manmu.top/moments/2"]')).not.toBeNull()
    expect(container.querySelector('a[href="https://example.com/docs"]')).not.toBeNull()
  })

  it('每条动态都有独立详情入口，跳转地址正确', () => {
    mockMoments(_moments)
    renderList()

    const links = screen.getAllByRole('link', { name: '阅读全文' })
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', '/moments/7')
    expect(links[1]).toHaveAttribute('href', '/moments/8')
  })

  it('代码块与文章同款脚手架', () => {
    mockMoments(_moments)
    const { container } = renderList()
    const block = container.querySelector('.md-code-block')
    expect(block?.querySelector('pre code')?.textContent).toBe('fmt.Println(1)\n')
  })
})