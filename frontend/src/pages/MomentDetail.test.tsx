import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MomentDetail } from './MomentDetail'
import { useMoment } from '../lib/queries'
import { renderMermaidIn } from '../lib/mermaid'
import type { UseQueryResult } from '@tanstack/react-query'
import type { MomentDTO } from '../types/api'

// 动态详情与文章共用同一条 Markdown 链路：裸 URL 自动链接、显式链接可点、危险协议被净化
vi.mock('../lib/queries', () => ({ useMoment: vi.fn() }))
vi.mock('../lib/mermaid', () => ({ renderMermaidIn: vi.fn(() => Promise.resolve()) }))

// 组件只消费 data 与三个状态位：成功态替身，其余 react-query 字段与断言无关
function mockMoment(data: MomentDTO | null) {
  const result = {
    isPending: false,
    isError: false,
    data,
    error: null,
    refetch: vi.fn(),
  } as unknown as UseQueryResult<MomentDTO | null>
  vi.mocked(useMoment).mockReturnValue(result)
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/moments/7']}>
      <Routes>
        <Route path="/moments/:id" element={<MomentDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

const _moment: MomentDTO = {
  id: 7,
  content: [
    '见 https://blog-manmu.top/moments/2 和 [文档](https://example.com/docs)',
    '',
    '```go',
    'fmt.Println(1)',
    '```',
  ].join('\n'),
  images: [],
  created_at: '2026-11-11T12:00:00+08:00',
}

describe('MomentDetail 正文渲染', () => {
  beforeEach(() => {
    mockMoment(_moment)
  })

  it('裸 URL 与显式 Markdown 链接都渲染为可点击 anchor', () => {
    const { container } = renderDetail()

    const bare = container.querySelector<HTMLAnchorElement>(
      'a[href="https://blog-manmu.top/moments/2"]',
    )
    expect(bare).not.toBeNull()
    expect(bare?.textContent).toBe('https://blog-manmu.top/moments/2')

    const explicit = container.querySelector<HTMLAnchorElement>('a[href="https://example.com/docs"]')
    expect(explicit).not.toBeNull()
    expect(explicit?.textContent).toBe('文档')
  })

  it('代码块复用文章脚手架，且对正文容器执行 Mermaid 渲染', () => {
    const { container } = renderDetail()

    const block = container.querySelector('.md-code-block')
    expect(block).not.toBeNull()
    expect(block?.querySelector('pre code')?.textContent).toBe('fmt.Println(1)\n')
    expect(renderMermaidIn).toHaveBeenCalledWith(container.querySelector('.md-content'))
  })

  it('危险协议不产生可点击链接', () => {
    mockMoment({ ..._moment, content: '[x](javascript:alert(1))' })
    const { container } = renderDetail()
    expect(container.querySelector('a[href^="javascript"]')).toBeNull()
  })
})