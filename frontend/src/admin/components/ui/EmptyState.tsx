import type { ComponentType, ReactNode } from 'react'
import { Button } from './Button'

// 空态：图标 + 主文案 + 可选说明与 CTA（全站统一的"暂无数据"模式）
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ComponentType<{ size?: number; className?: string }>
  title: ReactNode
  description?: ReactNode
  action?: { label: ReactNode; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-edge px-6 py-14 text-center">
      {Icon && <Icon size={30} className="text-faint" />}
      <p className="text-sm text-dim">{title}</p>
      {description && <p className="font-mono text-xs text-faint">{description}</p>}
      {action && (
        <Button variant="primary" size="sm" className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
