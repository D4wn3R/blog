import type { ReactNode } from 'react'
import { cn } from '../../../lib/cn'

type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral'

const TONES: Record<BadgeTone, { badge: string; dot: string }> = {
  success: { badge: 'border-neon/30 bg-neon/10 text-neon', dot: 'bg-neon' },
  warning: { badge: 'border-volt/30 bg-volt/10 text-volt', dot: 'bg-volt' },
  danger: { badge: 'border-pulse/30 bg-pulse/10 text-pulse', dot: 'bg-pulse' },
  neutral: { badge: 'border-edge bg-panel-2 text-dim', dot: 'bg-faint' },
}

// 状态徽标：圆角胶囊 + 可选彩点（发布=success / 隐藏=warning 等）
export function Badge({
  tone = 'neutral',
  dot = false,
  children,
}: {
  tone?: BadgeTone
  dot?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONES[tone].badge,
      )}
    >
      {dot && (
        <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', TONES[tone].dot)} />
      )}
      {children}
    </span>
  )
}
