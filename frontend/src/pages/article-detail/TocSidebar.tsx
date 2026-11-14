import { CaretDoubleLeft, List, X } from '@phosphor-icons/react'
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState } from 'react'
import type { TocItem } from '../../lib/markdown'
import { cn } from '../../lib/cn'

interface Props {
  toc: TocItem[]
  activeId: string
  // 当前文章标识：变化时折叠状态重置为设备默认（展开）
  articleKey: string
  // 桌面端折叠态由页面持有（需要联动正文区让位），本组件只上报
  collapsed: boolean
  onCollapseChange: (collapsed: boolean) => void
}

// 目录侧栏（文章详情页）：
// - 桌面端（xl 断点以上）：视口左侧常驻侧栏（导航下方起，独立滚动），可折叠为左缘小型入口；
//   断点显隐交给 CSS，两种形态的 DOM 互不感知。
// - 窄屏：默认收起，左下角「目录」按钮打开左侧抽屉；遮罩 / 关闭按钮 / 章节跳转关闭，
//   Esc、焦点圈禁、打开时焦点移入、关闭后焦点恢复、背景滚动锁定均由 Radix Dialog 内建。
// - 折叠状态只存组件外内存（页面 state），不写任何持久化存储，切换文章即重置。
export function TocSidebar({ toc, activeId, articleKey, collapsed, onCollapseChange }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // 切换文章：折叠状态按设备默认重新初始化（上报给页面 state）
  useEffect(() => {
    onCollapseChange(false)
  }, [articleKey, onCollapseChange])

  // 当前高亮项超出目录可视区时滚入目录内可见：只调整目录自身 scrollTop，不抢正文滚动
  useEffect(() => {
    if (collapsed) return
    const list = listRef.current
    const active = list?.querySelector<HTMLAnchorElement>('a[data-active]')
    if (!list || !active) return
    const top = active.offsetTop
    const bottom = top + active.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
  }, [activeId, collapsed, toc])

  // 窗口跨过桌面断点（含浏览器缩放）时抽屉已被 CSS 隐藏，同步关闭并解除滚动锁定
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setDrawerOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const renderTocList = (onNavigate?: () => void) => (
    <ul>
      {toc.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            onClick={onNavigate}
            data-active={activeId === item.id || undefined}
            className={cn(
              'block break-words border-l-2 py-1 text-xs leading-relaxed transition-colors',
              item.level === 3 ? 'pl-7' : item.level === 2 ? 'pl-5' : 'pl-3',
              activeId === item.id
                ? 'border-neon text-neon'
                : 'border-edge text-faint hover:text-ink',
            )}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ul>
  )

  return (
    <>
      {/* 桌面端常驻侧栏：从顶部导航下方延伸至视口底部 */}
      {!collapsed && (
        <nav
          aria-label="文章目录"
          className="fixed bottom-0 left-0 top-16 z-30 hidden w-56 flex-col border-r border-edge bg-void/85 backdrop-blur-md xl:flex"
        >
          <div className="flex items-center justify-between border-b border-edge px-4 py-3">
            <p className="font-mono text-[11px] tracking-widest text-faint">$ cat toc</p>
            <button
              type="button"
              aria-label="收起目录"
              onClick={() => onCollapseChange(true)}
              className="text-faint transition-colors hover:text-neon"
            >
              <CaretDoubleLeft size={14} />
            </button>
          </div>
          <div ref={listRef} data-testid="toc-scroll" className="relative flex-1 overflow-y-auto px-2 py-3">
            {renderTocList()}
          </div>
        </nav>
      )}

      {/* 桌面端折叠后的左缘小型展开入口 */}
      {collapsed && (
        <button
          type="button"
          aria-label="展开目录"
          onClick={() => onCollapseChange(false)}
          className="fixed top-1/2 left-0 z-30 hidden -translate-y-1/2 flex-col items-center border-y border-r border-edge bg-panel/90 px-1 py-5 font-mono text-[11px] tracking-widest text-faint transition-colors [writing-mode:vertical-rl] hover:text-neon xl:flex"
        >
          TOC
        </button>
      )}

      {/* 窄屏入口：左下角「目录」按钮 */}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-6 left-6 z-30 flex items-center gap-2 border border-edge bg-panel/90 px-3 py-2 font-mono text-xs text-dim transition-colors hover:text-neon xl:hidden"
      >
        <List size={14} />
        目录
      </button>

      {/* 窄屏抽屉：Radix Dialog（遮罩点击 / Esc / 焦点圈禁 / 滚动锁 / 焦点恢复内建），
          断点显隐与桌面端一致交给 CSS，故 Overlay/Content 补 xl:hidden */}
      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="animate__animated animate__fadeIn animate__faster fixed inset-0 z-50 bg-void/70 backdrop-blur-sm xl:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="animate__animated animate__fadeInLeft animate__faster fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-edge bg-panel outline-none xl:hidden"
          >
            <Dialog.Title className="sr-only">文章目录</Dialog.Title>
            <div className="flex items-center justify-between border-b border-edge px-4 py-3">
              <p className="font-mono text-[11px] tracking-widest text-faint">$ cat toc</p>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="关闭目录"
                  className="text-faint transition-colors hover:text-neon"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-3">{renderTocList(() => setDrawerOpen(false))}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
