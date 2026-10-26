import type { ReactNode } from 'react'
import { cn } from '../../../lib/cn'

// 面板容器：统一圆角与底色层级（页面 void → 卡片 panel → 悬停 panel-2）
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-edge bg-panel', className)}>{children}</div>
}
