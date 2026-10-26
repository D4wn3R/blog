import type { ReactNode } from 'react'
import { cn } from '../../../lib/cn'

// 语义化表格：容器圆角 + 表头淡字 + 行悬停高亮。
// head 声明列（可指定对齐）；行内直接写 tr/td（td 用 cell() 或自带 padding 类）
export function Table({
  head,
  children,
}: {
  head: { label: ReactNode; className?: string }[]
  children: ReactNode
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-edge bg-panel">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-edge">
            {head.map(({ label, className }, i) => (
              <th
                key={i}
                scope="col"
                className={cn(
                  'px-5 py-3.5 text-xs font-medium tracking-wide text-faint',
                  className,
                )}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-edge/60">{children}</tbody>
      </table>
    </div>
  )
}

// 行容器：悬停高亮
export function Row({ children }: { children: ReactNode }) {
  return <tr className="transition-colors hover:bg-panel-2">{children}</tr>
}

// 单元格基线（含右对齐变体）
export function cell(align?: 'right') {
  return cn('px-5 py-3.5 align-middle', align === 'right' && 'text-right')
}
