import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TocSidebar } from './TocSidebar'
import type { TocItem } from '../../lib/markdown'

// 目录侧栏：桌面端常驻左栏（折叠/展开 + 高亮滚入可视区）+ 窄屏抽屉（Radix Dialog）。
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

// matchMedia 替身：记录 change 监听，测试里手动触发断点穿越
type MediaListener = (e: { matches: boolean }) => void
let mediaListeners: MediaListener[] = []
function stubMatchMedia(matches: boolean) {
  mediaListeners = []
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: (_: string, l: MediaListener) => mediaListeners.push(l),
      removeEventListener: (_: string, l: MediaListener) => {
        mediaListeners = mediaListeners.filter((x) => x !== l)
      },
    })),
  )
}
beforeEach(() => {
  // 组件挂载即订阅桌面断点；默认窄屏（matches=false）
  stubMatchMedia(false)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

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

    rerender(
      <TocSidebar {...baseProps} articleKey="another-slug" onCollapseChange={onCollapseChange} />,
    )
    expect(onCollapseChange).toHaveBeenLastCalledWith(false)
  })

  it('高亮项在目录可视区下方时，目录自身 scrollTop 滚动到可见，不触碰页面滚动', () => {
    const { rerender } = render(
      <TocSidebar {...baseProps} activeId="intro" onCollapseChange={vi.fn()} />,
    )

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
    const { rerender } = render(
      <TocSidebar {...baseProps} activeId="detail" onCollapseChange={vi.fn()} />,
    )

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
  // Radix Dialog 内建行为（Esc / 遮罩 / 焦点圈禁 / 滚动锁 / 焦点恢复）不重复测，
  // 这里只验证组件自身逻辑：入口开关、上报独立、章节跳转关闭、断点穿越关闭。
  it('「目录」入口打开抽屉；入口与桌面收起入口互相独立', () => {
    const onCollapseChange = vi.fn()
    render(<TocSidebar {...baseProps} collapsed onCollapseChange={onCollapseChange} />)

    const dialog = openDrawer()
    expect(
      within(dialog)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['intro', 'usage', 'detail'])
    // 抽屉开关不改动桌面折叠态（挂载初始化上报的 false 除外）
    expect(onCollapseChange).not.toHaveBeenCalledWith(true)
  })

  it('点击章节跳转后自动关闭抽屉', () => {
    render(<TocSidebar {...baseProps} onCollapseChange={vi.fn()} />)
    const dialog = openDrawer()

    fireEvent.click(within(dialog).getByRole('link', { name: 'usage' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('窗口跨过桌面断点（如缩放）时抽屉自动关闭', () => {
    stubMatchMedia(false)
    render(<TocSidebar {...baseProps} onCollapseChange={vi.fn()} />)

    openDrawer()
    act(() => {
      mediaListeners.forEach((l) => l({ matches: true }))
    })
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
    const dialog = openDrawer()
    fireEvent.click(within(dialog).getByRole('link', { name: 'intro' }))

    expect(setItem).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
  })
})
