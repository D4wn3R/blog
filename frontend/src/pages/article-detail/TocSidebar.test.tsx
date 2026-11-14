import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TocSidebar } from './TocSidebar'
import type { TocItem } from '../../lib/markdown'

// 目录侧栏：桌面端常驻左栏（折叠/展开 + 高亮滚入可视区）+ 窄屏抽屉（焦点/滚动锁定/Esc）。
// 桌面/窄屏的显隐由 CSS 断点驱动，jsdom 里两种 DOM 同时存在，用可访问名称区分。

const toc: TocItem[] = [
  { id: 'intro', text: 'intro', level: 1 },
  { id: 'usage', text: 'usage', level: 2 },
  { id: 'detail', text: 'detail', level: 3 },
]

const baseProps = { toc, activeId: '', articleKey: 'some-slug', collapsed: false }

function openDrawer() {
  fireEvent.click(screen.getByRole('button', { name: '目录' }))
  return screen.getByRole('dialog', { name: '文章目录' })
}

function stubRect(el: HTMLElement, props: { offsetTop?: number; offsetHeight?: number }) {
  if (props.offsetTop !== undefined) {
    Object.defineProperty(el, 'offsetTop', { configurable: true, value: props.offsetTop })
  }
  if (props.offsetHeight !== undefined) {
    Object.defineProperty(el, 'offsetHeight', { configurable: true, value: props.offsetHeight })
  }
}

describe('TocSidebar 桌面侧栏', () => {
  it('渲染目录导航、全部条目与收起按钮', () => {
    render(<TocSidebar {...baseProps} onCollapseChange={vi.fn()} />)

    const nav = screen.getByRole('navigation', { name: '文章目录' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#intro', '#usage', '#detail'])
    expect(screen.getByRole('button', { name: '收起目录' })).toBeInTheDocument()
  })

  it('点击收起按钮上报折叠', () => {
    const onCollapseChange = vi.fn()
    render(<TocSidebar {...baseProps} onCollapseChange={onCollapseChange} />)

    fireEvent.click(screen.getByRole('button', { name: '收起目录' }))
    expect(onCollapseChange).toHaveBeenCalledWith(true)
  })

  it('折叠后目录收起，仅保留小型展开入口；点击入口上报展开', () => {
    const onCollapseChange = vi.fn()
    render(<TocSidebar {...baseProps} collapsed onCollapseChange={onCollapseChange} />)

    expect(screen.queryByRole('navigation', { name: '文章目录' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '展开目录' }))
    expect(onCollapseChange).toHaveBeenCalledWith(false)
  })

  it('切换文章时折叠状态重置为设备默认（展开）', () => {
    const onCollapseChange = vi.fn()
    const { rerender } = render(
      <TocSidebar {...baseProps} collapsed onCollapseChange={onCollapseChange} />,
    )

    rerender(<TocSidebar {...baseProps} articleKey="another-slug" onCollapseChange={onCollapseChange} />)
    expect(onCollapseChange).toHaveBeenLastCalledWith(false)
  })

  it('高亮项在目录可视区下方时，目录自身 scrollTop 滚动到可见，不触碰页面滚动', () => {
    const { rerender } = render(<TocSidebar {...baseProps} activeId="intro" onCollapseChange={vi.fn()} />)

    const list = screen.getByTestId('toc-scroll')

    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 300 })
    list.scrollTop = 100
    const active = list.querySelector<HTMLAnchorElement>('a[href="#detail"]')
    expect(active).not.toBeNull()
    stubRect(active!, { offsetTop: 800, offsetHeight: 24 })

    // activeId 变化触发重新测量
    rerender(<TocSidebar {...baseProps} activeId="detail" onCollapseChange={vi.fn()} />)
    expect(list.scrollTop).toBe(800 + 24 - 300)
    expect(window.scrollY).toBe(0)
  })

  it('高亮项滚到目录可视区上方时向上回滚到条目顶部', () => {
    const { rerender } = render(<TocSidebar {...baseProps} activeId="detail" onCollapseChange={vi.fn()} />)

    const list = screen.getByTestId('toc-scroll')
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 300 })
    list.scrollTop = 1000
    const active = list.querySelector<HTMLAnchorElement>('a[href="#intro"]')
    expect(active).not.toBeNull()
    stubRect(active!, { offsetTop: 50, offsetHeight: 24 })

    rerender(<TocSidebar {...baseProps} activeId="intro" onCollapseChange={vi.fn()} />)
    expect(list.scrollTop).toBe(50)
  })
})

describe('TocSidebar 窄屏抽屉', () => {
  it('「目录」入口打开抽屉，锁定背景滚动；入口与收起入口互相独立', () => {
    const onCollapseChange = vi.fn()
    render(<TocSidebar {...baseProps} collapsed onCollapseChange={onCollapseChange} />)

    const dialog = openDrawer()
    expect(within(dialog).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'intro',
      'usage',
      'detail',
    ])
    expect(document.body.style.overflow).toBe('hidden')
    // 抽屉开关不改动桌面折叠态（挂载初始化上报的 false 除外）
    expect(onCollapseChange).not.toHaveBeenCalledWith(true)
  })

  it('打开时焦点移入抽屉，Esc 关闭后焦点恢复、滚动锁定解除', () => {
    render(
      <>
        <button type="button">外部按钮</button>
        <TocSidebar {...baseProps} onCollapseChange={vi.fn()} />
      </>,
    )
    const outside = screen.getByRole('button', { name: '外部按钮' })
    outside.focus()

    openDrawer()
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: '文章目录' }))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(outside)
    expect(document.body.style.overflow).toBe('')
  })

  it('点击遮罩关闭抽屉', () => {
    render(<TocSidebar {...baseProps} onCollapseChange={vi.fn()} />)
    openDrawer()

    fireEvent.click(screen.getByTestId('toc-overlay'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('点击关闭按钮关闭抽屉', () => {
    render(<TocSidebar {...baseProps} onCollapseChange={vi.fn()} />)
    openDrawer()

    fireEvent.click(screen.getByRole('button', { name: '关闭目录' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('点击章节跳转后自动关闭抽屉', () => {
    render(<TocSidebar {...baseProps} onCollapseChange={vi.fn()} />)
    const dialog = openDrawer()

    fireEvent.click(within(dialog).getByRole('link', { name: 'usage' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('TocSidebar 持久化红线', () => {
  it('开关折叠与抽屉全程不读写 localStorage / sessionStorage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const getItem = vi.spyOn(Storage.prototype, 'getItem')

    const onCollapseChange = vi.fn()
    const { rerender } = render(<TocSidebar {...baseProps} onCollapseChange={onCollapseChange} />)
    fireEvent.click(screen.getByRole('button', { name: '收起目录' }))
    rerender(<TocSidebar {...baseProps} collapsed onCollapseChange={onCollapseChange} />)
    fireEvent.click(screen.getByRole('button', { name: '展开目录' }))
    openDrawer()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(setItem).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
  })
})
