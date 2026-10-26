import { Button } from './Button'

// 分页：上一页/下一页按钮化 + 页码指示
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex items-center justify-end gap-2.5">
      <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </Button>
      <span className="font-mono text-xs text-faint">
        {page} / {totalPages}
      </span>
      <Button size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        下一页
      </Button>
    </div>
  )
}
