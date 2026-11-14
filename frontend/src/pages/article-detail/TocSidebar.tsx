import { useEffect, useRef, useState } from 'react'
import { CaretDoubleLeft, List, X } from '@phosphor-icons/react'
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
// - 窄屏：默认收起，左下角「目录」按钮打开左侧抽屉；关闭按钮 / 遮罩 / Esc 三路关闭，
//   点章节跳转后自动关闭；打开期间焦点移入抽屉并锁定背景滚动，关闭后恢复。
// - 折叠状态只存组件外内存（页面 state），不写任何持久化存储，切换文章即重置。
export function TocSidebar({ toc, activeId, articleKey, collapsed, onCollapseChange }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

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

  // 抽屉打开：焦点移入抽屉 + 锁定背景滚动；关闭：全部恢复
  useEffect(() => {
    if (!drawerOpen) return
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    drawerRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      restoreFocusRef.current?.focus()
    }
  }, [drawerOpen])

  // Esc 关闭抽屉（仅抽屉打开期间监听）
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

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

      {/* 窄屏抽屉：遮罩 + 左侧面板 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            data-testid="toc-overlay"
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
            className="animate__animated animate__fadeIn animate__faster absolute inset-0 bg-void/70 backdrop-blur-sm"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="文章目录"
            tabIndex={-1}
            className="animate__animated animate__fadeInLeft animate__faster absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-edge bg-panel outline-none"
          >
            <div className="flex items-center justify-between border-b border-edge px-4 py-3">
              <p className="font-mono text-[11px] tracking-widest text-faint">$ cat toc</p>
              <button
                type="button"
                aria-label="关闭目录"
                onClick={() => setDrawerOpen(false)}
                className="text-faint transition-colors hover:text-neon"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-3">{renderTocList(() => setDrawerOpen(false))}</div>
          </div>
        </div>
      )}
    </>
  )
}
