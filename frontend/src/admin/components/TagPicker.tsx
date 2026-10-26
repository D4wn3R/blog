import { useState } from 'react'
import { Plus, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'

interface TagPickerProps {
  value: string[]
  onChange: (next: string[]) => void
  /** 候选标签（数据驱动，由调用方传入：如 /api/tags 全量或当前条目 tags/items 并集） */
  pool: string[]
  /** 输入新标签时的创建回调（是否落库由调用方决定）：返回错误文案则提示，成功时调用方负责把新标签补进 pool；缺省仅本地选中 */
  onCreate?: (tag: string) => string | null | Promise<string | null>
  /** 行内紧凑模式：默认收起，点按钮展开标签库 */
  collapsible?: boolean
}

// 标签选择器：候选点选 + 输入新建（回车或按钮），上限 10 项、单项 30 字
export function TagPicker({
  value,
  onChange,
  pool,
  onCreate,
  collapsible = false,
}: TagPickerProps) {
  const [open, setOpen] = useState(!collapsible)
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const pick = (tag: string) => {
    if (value.includes(tag)) {
      onChange(value.filter((t) => t !== tag))
      setErr(null)
      return
    }
    if (value.length >= 10) {
      setErr('最多选择 10 项')
      return
    }
    onChange([...value, tag])
    setErr(null)
  }

  const create = async () => {
    const tag = draft.trim()
    if (!tag || creating) return
    if ([...tag].length > 30) {
      setErr('单个标签不超过 30 字')
      return
    }
    if (!value.includes(tag)) {
      if (value.length >= 10) {
        setErr('最多选择 10 项')
        return
      }
      // 候选池已存在 → 直接选中（避免对已存在标签走创建报 40900）
      if (pool.includes(tag)) {
        onChange([...value, tag])
        setDraft('')
        setErr(null)
        return
      }
      if (onCreate) {
        setCreating(true)
        const createErr = await onCreate(tag)
        setCreating(false)
        if (createErr) {
          setErr(createErr)
          return
        }
      }
      onChange([...value, tag])
    }
    setDraft('')
    setErr(null)
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 border border-neon/50 bg-neon/10 px-2 py-0.5 font-mono text-[11px] text-neon"
          >
            {tag}
            <button
              type="button"
              aria-label={`移除标签 ${tag}`}
              onClick={() => pick(tag)}
              className="text-neon/70 transition-colors hover:text-pulse"
            >
              <X size={10} weight="bold" />
            </button>
          </span>
        ))}
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="border border-dashed border-edge px-2 py-0.5 font-mono text-[11px] text-faint transition-colors hover:border-neon/50 hover:text-neon"
          >
            {open ? '收起' : '标签'}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={draft}
              aria-label="新建标签"
              onChange={(e) => {
                setDraft(e.target.value)
                setErr(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void create()
                }
              }}
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => void create()}
              disabled={!draft.trim() || creating}
              className="flex shrink-0 items-center gap-1 border border-neon/50 px-3 py-2 font-mono text-xs text-neon transition-colors hover:bg-neon hover:text-void disabled:pointer-events-none disabled:opacity-40"
            >
              <Plus size={11} weight="bold" />
              添加
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pool.map((tag) => {
              const selected = value.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => pick(tag)}
                  className={cn(
                    'border px-2 py-0.5 font-mono text-[11px] transition-colors',
                    selected
                      ? 'border-neon/60 bg-neon/10 text-neon'
                      : 'border-edge text-faint hover:border-neon/50 hover:text-neon',
                  )}
                >
                  {tag}
                </button>
              )
            })}
          </div>
          {err && <p className="font-mono text-[11px] text-pulse">{err}</p>}
        </div>
      )}
    </div>
  )
}
