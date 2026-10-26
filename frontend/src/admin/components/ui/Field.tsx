import type { ReactNode } from 'react'
import { cn } from '../../../lib/cn'

// 表单字段容器：label + 控件 + hint/error 标准布局。
// label 为包裹式关联（implicit label），控件免写 id；
// 控件旁需要交互元素的自定义提示（如密码"取消加密"）写在 Field 之外
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-pulse">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-faint">{hint}</span>
      ) : null}
    </label>
  )
}
