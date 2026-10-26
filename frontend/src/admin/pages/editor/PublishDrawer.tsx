import * as Dialog from '@radix-ui/react-dialog'
import { FloppyDisk, LockSimple, PushPin, X } from '@phosphor-icons/react'
import type { IdName } from '../../../types/api'
import { cn } from '../../../lib/cn'
import { CategoryField } from '../../components/CategoryField'
import { TagPicker } from '../../components/TagPicker'
import { ImageUpload } from '../../components/ImageUpload'
import { Field, Input, NativeSelect, Textarea } from '../../components/ui'

// 发布抽屉（掘金式）：元信息收纳，点保存弹出确认 / 设置按钮随时唤出。
// 受控视图组件——表单状态由页面层持有，这里只负责渲染与回调

const STATUS_OPTIONS = [
  { value: 1, label: '发布' },
  { value: 2, label: '隐藏' },
] as const

export interface PublishDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  categoryName: string | null
  tagNames: string[]
  cover: string
  summary: string
  pinned: boolean
  status: 1 | 2
  // password 三态（#A7）：null = 不变；'' = 显式取消加密；非空 = 设置/修改
  password: string | null
  hasPassword: boolean
  categories: IdName[]
  tagPool: string[]
  submitting: boolean
  slugError?: string
  categoryNameError?: string
  onSlugChange: (v: string) => void
  onPickCategory: (name: string) => void
  onClearCategory: () => void
  onCreateCategory: (name: string) => Promise<string | null>
  onTagsChange: (next: string[]) => void
  onCreateTag: (name: string) => Promise<string | null>
  onCoverChange: (v: string | null) => void
  onSummaryChange: (v: string) => void
  onPinnedChange: (v: boolean) => void
  onStatusChange: (v: 1 | 2) => void
  onPasswordChange: (v: string | null) => void
  onSave: () => void
}

export function PublishDrawer(p: PublishDrawerProps) {
  return (
    <Dialog.Root open={p.open} onOpenChange={p.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-void/85" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-md flex-col overflow-y-auto border-l border-edge bg-panel shadow-[0_0_24px_rgba(46,230,255,0.18)] outline-none animate__animated animate__faster animate__fadeInRight"
        >
          <div className="flex items-center justify-between border-b border-edge px-5 py-3">
            <Dialog.Title className="font-mono text-sm text-neon">文章设置</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="关闭设置"
                className="text-faint transition-colors hover:text-ink"
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-5 px-5 py-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="发布状态">
                <NativeSelect
                  aria-label="发布状态"
                  value={p.status}
                  onChange={(e) => p.onStatusChange(Number(e.target.value) as 1 | 2)}
                >
                  {STATUS_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="SLUG" hint="小写字母、数字与中划线" error={p.slugError}>
                <Input
                  value={p.slug}
                  error={Boolean(p.slugError)}
                  onChange={(e) => p.onSlugChange(e.target.value)}
                  className="font-mono text-xs"
                />
              </Field>
            </div>

            <Field label="分类" hint="输入即创建，回车或点添加" error={p.categoryNameError}>
              <CategoryField
                value={p.categoryName}
                pool={p.categories}
                onPick={(_id, name) => p.onPickCategory(name)}
                onClear={p.onClearCategory}
                onCreate={p.onCreateCategory}
              />
            </Field>

            <Field label="标签">
              <TagPicker
                value={p.tagNames}
                onChange={p.onTagsChange}
                pool={p.tagPool}
                onCreate={p.onCreateTag}
              />
            </Field>

            <Field label="摘要" hint="留空自动截取正文前 200 字">
              <div>
                <Textarea
                  value={p.summary}
                  rows={3}
                  onChange={(e) => p.onSummaryChange(e.target.value)}
                />
                <span className="mt-1 block text-right font-mono text-[10px] text-faint">
                  {[...p.summary].length}/500
                </span>
              </div>
            </Field>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">封面图</span>
              <ImageUpload value={p.cover || null} onChange={p.onCoverChange} label="上传封面图" />
            </div>

            <Field label="访问密码">
              <div>
                <div className="relative">
                  <LockSimple
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                  />
                  <Input
                    value={p.password ?? ''}
                    type="password"
                    placeholder={p.hasPassword ? '已加密 · 留空保持不变' : '不加密'}
                    onChange={(e) =>
                      p.onPasswordChange(e.target.value === '' ? null : e.target.value)
                    }
                    className="pl-8"
                  />
                </div>
                {p.password === '' ? (
                  <p className="mt-1.5 flex items-center justify-between text-xs text-pulse">
                    保存后将取消加密
                    <button
                      type="button"
                      onClick={() => p.onPasswordChange(null)}
                      className="text-dim transition-colors hover:text-neon"
                    >
                      还原
                    </button>
                  </p>
                ) : p.hasPassword ? (
                  <p className="mt-1.5 flex items-center justify-between text-xs text-faint">
                    已加密{p.password !== null ? '，保存后更新密码' : '，留空保持不变'}
                    <button
                      type="button"
                      onClick={() => p.onPasswordChange('')}
                      className="transition-colors hover:text-pulse"
                    >
                      取消加密
                    </button>
                  </p>
                ) : null}
              </div>
            </Field>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-dim">
              <input
                type="checkbox"
                checked={p.pinned}
                onChange={(e) => p.onPinnedChange(e.target.checked)}
                className={cn(
                  'h-4 w-4 appearance-none rounded border border-edge bg-void',
                  'checked:border-neon checked:bg-neon',
                )}
              />
              <PushPin size={13} />
              置顶（列表优先展示）
            </label>
          </div>

          <div className="mt-auto flex items-center justify-end gap-2.5 border-t border-edge px-5 py-4">
            <Dialog.Close asChild>
              <button
                type="button"
                className="border border-edge px-4 py-1.5 font-mono text-xs text-dim transition-colors hover:border-neon/50 hover:text-neon"
              >
                取消
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={p.submitting}
              onClick={p.onSave}
              className="inline-flex items-center gap-1.5 rounded-md bg-neon px-4 py-1.5 font-mono text-xs font-medium text-void transition-colors hover:bg-neon/85 disabled:pointer-events-none disabled:opacity-50"
            >
              <FloppyDisk size={13} />
              {p.submitting ? '保存中…' : '保存'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
