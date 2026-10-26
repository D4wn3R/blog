import { useState } from 'react'
import { Plus, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import type { IdName } from '../../types/api'

interface CategoryFieldProps {
  /** 当前选中分类名（null/空 = 未选） */
  value: string | null
  /** 现有分类候选（调用方从 /api/categories 加载并维护） */
  pool: IdName[]
  onPick: (id: number, name: string) => void
  onClear: () => void
  /** 输入新分类时的创建回调（调用方负责 #A10 落库并补进 pool），返回错误文案则提示 */
  onCreate: (name: string) => Promise<string | null>
}

// 分类选择器：与 TagPicker 同交互范式的单选版——候选点选（点=选中、再点同一个=取消）+ 输入新建（回车或按钮），
// 输入已存在的名字直接选中、不存在则创建（解决空库无可选分类的问题）
export function CategoryField({ value, pool, onPick, onClear, onCreate }: CategoryFieldProps) {
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const pick = (c: IdName) => {
    if (value === c.name) {
      onClear()
      return
    }
    onPick(c.id, c.name)
    setErr(null)
  }

  const create = async () => {
    const name = draft.trim()
    if (!name || creating) return
    if ([...name].length > 50) {
      setErr('分类名不超过 50 字')
      return
    }
    const exist = pool.find((c) => c.name === name)
    if (exist) {
      // 已选中的再提交不做 toggle（输入框语义是"确保选中"），仅清空草稿
      if (value !== exist.name) pick(exist)
      setDraft('')
      return
    }
    setCreating(true)
    const createErr = await onCreate(name)
    setCreating(false)
    if (createErr) {
      setErr(createErr)
      return
    }
    setDraft('')
    setErr(null)
  }

  return (
    <div className="min-w-0">
      {value ? (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="flex items-center gap-1 border border-neon/50 bg-neon/10 px-2 py-0.5 font-mono text-[11px] text-neon">
            {value}
            <button
              type="button"
              aria-label="移除分类"
              onClick={onClear}
              className="text-neon/70 transition-colors hover:text-pulse"
            >
              <X size={10} weight="bold" />
            </button>
          </span>
        </div>
      ) : null}
      <div className="flex gap-2">
        <input
          value={draft}
          aria-label="新建分类"
          placeholder="输入分类名，已存在则直接选中"
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
          {creating ? '创建中…' : '添加'}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {pool.map((c) => {
          const selected = value === c.name
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c)}
              className={cn(
                'border px-2 py-0.5 font-mono text-[11px] transition-colors',
                selected
                  ? 'border-neon/60 bg-neon/10 text-neon'
                  : 'border-edge text-faint hover:border-neon/50 hover:text-neon',
              )}
            >
              {c.name}
            </button>
          )
        })}
      </div>
      {err && <p className="mt-2 font-mono text-[11px] text-pulse">{err}</p>}
    </div>
  )
}
