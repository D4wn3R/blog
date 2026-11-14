import { Link } from 'react-router'
import type { ArticleNav } from '../../types/api'
import { cn } from '../../lib/cn'

// 同分类上一篇/下一篇导航（#13）：自定义 tooltip，hover 与键盘聚焦均可见，
// 沿用赛博朋克配色（panel 底 + edge 边框 + mono 字体 + neon 文案）。
// 边界（nav 为 null）按钮仍渲染保持布局稳定，但不可跳转，tooltip 显示边界提示。
interface PrevNextNavProps {
  direction: 'prev' | 'next'
  nav: ArticleNav | null
}

const boundaryTips = {
  prev: '开始看吧～',
  next: '看完了，去别处逛逛吧～',
} as const

const labels = {
  prev: '← 上一篇',
  next: '下一篇 →',
} as const

export function PrevNextNav({ direction, nav }: PrevNextNavProps) {
  const tip = nav ? nav.title : boundaryTips[direction]
  const tipId = `nav-tip-${direction}`
  const base =
    'group relative inline-flex max-w-full items-center gap-1.5 font-mono text-xs transition-colors'

  const body = (
    <>
      <span>{labels[direction]}</span>
      {/* tooltip：group-hover / group-focus-within 双通道显隐，键盘 Tab 聚焦同样可见 */}
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden max-w-[90vw] -translate-x-1/2 truncate border border-edge bg-panel px-3 py-1.5 text-dim shadow-[0_0_12px_rgba(46,230,255,0.15)] group-hover:block group-focus-within:block"
      >
        {tip}
      </span>
    </>
  )

  if (!nav) {
    return (
      <span
        className={cn(base, 'cursor-default text-faint')}
        aria-disabled="true"
        aria-describedby={tipId}
        tabIndex={0}
      >
        {body}
      </span>
    )
  }

  return (
    <Link
      to={`/posts/${nav.slug}`}
      className={cn(base, 'text-dim hover:text-neon')}
      aria-describedby={tipId}
    >
      {body}
    </Link>
  )
}
