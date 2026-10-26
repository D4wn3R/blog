import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

// 数据展示位的三态占位（规范：loading / error / empty 缺一不可），
// 对齐全站 mono 终端风格；C 端各页面的三元链统一收编到这里

export function LoadingLine({
  text = 'loading...',
  className,
}: {
  text?: string
  className?: string
}) {
  return (
    <p
      className={cn(
        'animate__animated animate__pulse animate__infinite animate__slower py-10 font-mono text-sm text-faint',
        className,
      )}
    >
      {text}
    </p>
  )
}

export function ErrorLine({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div className={cn('animate__animated animate__headShake py-10 font-mono text-sm', className)}>
      <p className="text-pulse">error: {message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 border border-edge px-3 py-1 text-xs text-dim transition-colors hover:border-neon/40 hover:text-neon"
        >
          retry
        </button>
      )}
    </div>
  )
}

export function EmptyLine({
  text,
  children,
  className,
}: {
  text: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('py-10 font-mono text-sm text-faint', className)}>
      <p>{text}</p>
      {children}
    </div>
  )
}
