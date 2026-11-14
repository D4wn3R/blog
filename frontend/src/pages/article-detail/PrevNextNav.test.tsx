import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router'
import { PrevNextNav } from './PrevNextNav'
import type { ArticleNav } from '../../types/api'

// 相邻导航按钮（#13）：正常态跳转 + tooltip 文章名；边界态不跳转 + tooltip 边界文案；
// 跨文章切换（rerender）后 tooltip 不残留上一篇面的目标文章名
const target: ArticleNav = { slug: 'hello-world', title: '你好世界', published_at: null }

function renderNav(direction: 'prev' | 'next', nav: ArticleNav | null) {
  return render(
    <MemoryRouter>
      <PrevNextNav direction={direction} nav={nav} />
    </MemoryRouter>,
  )
}

describe('PrevNextNav 正常态', () => {
  it('渲染为指向目标 slug 的链接，tooltip 显示目标文章名', () => {
    const { container } = renderNav('prev', target)
    const link = screen.getByRole('link', { name: /上一篇/ })
    expect(link.getAttribute('href')).toBe('/posts/hello-world')
    // tooltip 常驻 DOM（CSS 控制显隐），文本为目标文章名
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe('你好世界')
  })

  it('hover 与键盘聚焦都让 tooltip 可见（group-hover / group-focus-within 双 class）', () => {
    const { container } = renderNav('next', target)
    const link = screen.getByRole('link', { name: /下一篇/ })
    const tooltip = container.querySelector('[role="tooltip"]') as HTMLElement
    expect(tooltip.className).toContain('group-hover:block')
    expect(tooltip.className).toContain('group-focus-within:block')
    expect(tooltip.className).not.toContain('title=')
    fireEvent.mouseEnter(link)
    fireEvent.focus(link)
    // 不用原生 title：确认未渲染原生提示属性
    expect(link.getAttribute('title')).toBeNull()
  })
})

describe('PrevNextNav 边界态', () => {
  it('prev 为 null：不渲染链接不可跳转，tooltip 显示「开始看吧～」', () => {
    const { container } = renderNav('prev', null)
    expect(container.querySelector('a')).toBeNull()
    expect(screen.getByText('开始看吧～')).toBeTruthy()
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe('开始看吧～')
  })

  it('next 为 null：不渲染链接不可跳转，tooltip 显示「看完了，去别处逛逛吧～」', () => {
    const { container } = renderNav('next', null)
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe('看完了，去别处逛逛吧～')
  })

  it('单篇分类：两侧均渲染按钮（布局稳定）且均为不可跳转的占位', () => {
    const { container: prevC } = renderNav('prev', null)
    const { container: nextC } = renderNav('next', null)
    expect(prevC.querySelector('a')).toBeNull()
    expect(nextC.querySelector('a')).toBeNull()
    // 按钮本体仍渲染
    expect(screen.getAllByText(/上一篇|下一篇/).length).toBe(2)
  })
})

describe('PrevNextNav 跨文章切换', () => {
  it('nav 数据变化后 tooltip 跟随刷新，无上一篇文章名残留', () => {
    const { rerender, container } = renderNav('next', target)
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe('你好世界')
    rerender(
      <MemoryRouter>
        <PrevNextNav
          direction="next"
          nav={{ slug: 'next-post', title: '下一篇文章', published_at: null }}
        />
      </MemoryRouter>,
    )
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe('下一篇文章')
    expect(container.textContent).not.toContain('你好世界')
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/posts/next-post')
  })
})
