import { useState } from 'react'
import {
  CaretDown,
  FloppyDisk,
  Plus,
  Prohibit,
  TrashSimple,
  X,
  ArrowCounterClockwise,
} from '@phosphor-icons/react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import * as Dialog from '@radix-ui/react-dialog'
import * as Select from '@radix-ui/react-select'
import { useSortable } from '@dnd-kit/sortable'
import type { DraggableAttributes } from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { CSS } from '@dnd-kit/utilities'
import { toast } from 'sonner'
import { Button } from '../../components/ui'
import { CONTACT_ICON_OPTIONS, getContactIcon } from '../../../components/ContactIcons'
import { cn } from '../../../lib/cn'

// AdminAbout 各分区共用的小件：交互原语基于 Radix/dnd-kit/sonner（规范对照表指定库）

/** 保存按钮：onAttempt 返回 false（校验不通过 / 提交失败）则停留待保存态，成功经 toast 提示 */
export function SaveButton({
  show,
  label,
  onAttempt,
}: {
  show: boolean
  label: string
  onAttempt: () => boolean | Promise<boolean>
}) {
  const [saving, setSaving] = useState(false)

  if (!show && !saving) return null

  return (
    <Button
      variant="primary"
      size="sm"
      loading={saving}
      onClick={() => {
        if (saving) return
        setSaving(true)
        void Promise.resolve(onAttempt()).then((ok) => {
          setSaving(false)
          if (ok) toast.success('已保存')
        })
      }}
    >
      <FloppyDisk size={13} />
      {label}
    </Button>
  )
}

/** 区块操作行：脏时浮现 [撤销修改] [保存]，与分区标题同行右侧对齐（保存交互统一入口） */
export function SectionActions({
  dirty,
  onUndo,
  onSave,
  saveLabel = '保存',
}: {
  dirty: boolean
  onUndo: () => void
  onSave: () => boolean | Promise<boolean>
  saveLabel?: string
}) {
  if (!dirty) return null
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={onUndo}
        className="inline-flex h-8 items-center gap-1 rounded-md border border-edge px-3 font-mono text-xs text-dim transition-colors hover:border-neon/50 hover:text-neon"
      >
        <ArrowCounterClockwise size={12} />
        撤销修改
      </button>
      <SaveButton show label={saveLabel} onAttempt={onSave} />
    </div>
  )
}

/** 删除二次确认（Radix AlertDialog）：Esc / 遮罩关闭，焦点圈定 */
export function ConfirmDeleteButton({
  name,
  onConfirm,
  disabled,
}: {
  name: string
  onConfirm: () => void
  disabled?: boolean
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <button
          type="button"
          aria-label={`删除 ${name}`}
          disabled={disabled}
          title={`删除 ${name}`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-edge text-faint transition-colors hover:border-pulse/60 hover:text-pulse disabled:pointer-events-none disabled:opacity-40"
        >
          <TrashSimple size={14} />
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-void/85" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-pulse/40 bg-panel p-6 shadow-[0_0_24px_rgba(255,46,136,0.15)]">
          <AlertDialog.Title className="text-lg font-semibold text-ink">
            删除 {name}？
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-dim">
            此操作不可恢复，请确认。
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2.5">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-md border border-edge px-4 text-sm text-dim transition-colors hover:border-neon/50 hover:text-ink"
              >
                取消
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                onClick={onConfirm}
                className="inline-flex h-9 items-center rounded-md border border-pulse/50 bg-pulse/10 px-4 text-sm font-medium text-pulse transition-colors hover:bg-pulse hover:text-void"
              >
                确认删除
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-dashed border-edge text-sm text-faint transition-colors hover:border-neon/50 hover:text-neon"
    >
      <Plus size={13} weight="bold" />
      {label}
    </button>
  )
}

export function TagSpans({ value, className = '' }: { value: string[]; className?: string }) {
  if (value.length === 0) return null
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {value.map((t) => (
        <span key={t} className="border border-edge px-2 py-0.5 font-mono text-[11px] text-faint">
          {t}
        </span>
      ))}
    </div>
  )
}

export function RuneCount({ value, max }: { value: string; max: number }) {
  return (
    <span className="mt-1 block text-right font-mono text-[10px] text-faint">
      {value.length}/{max}
    </span>
  )
}

/** 渠道下拉（Radix Select）：选项=名称+图标成对渲染；历史自由值不在选项表内时保底插入，防误改 */
const ICON_NONE = '__none__'

export function IconSelect({
  value,
  onChange,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  // Radix SelectItem 的 value 不允许空串：未设置态用哨兵映射
  const options = CONTACT_ICON_OPTIONS.some((o) => o.value === value)
    ? CONTACT_ICON_OPTIONS
    : [{ value, label: value === '' ? '未设置' : value }, ...CONTACT_ICON_OPTIONS]
  const CurrentIcon = value === '' ? Prohibit : getContactIcon(value)

  return (
    <div className={cn('relative min-w-0', className)}>
      <Select.Root
        value={value === '' ? ICON_NONE : value}
        onValueChange={(v) => onChange(v === ICON_NONE ? '' : v)}
      >
        <Select.Trigger
          aria-label="渠道图标"
          className="flex h-9 w-full items-center gap-2 rounded-md border border-edge bg-void px-3 text-sm text-ink transition-colors hover:border-neon/60 data-[state=open]:border-neon/60"
        >
          <CurrentIcon size={15} className="shrink-0 text-neon" />
          <Select.Value />
          <Select.Icon className="ml-auto shrink-0 text-faint">
            <CaretDown size={11} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={4}
            className="z-50 min-w-[10rem] rounded-md border border-neon/40 bg-panel py-1 shadow-[0_0_24px_rgba(46,230,255,0.18)]"
          >
            <Select.Viewport>
              {options.map((o) => {
                const Icon = o.value === '' ? Prohibit : getContactIcon(o.value)
                return (
                  <Select.Item
                    key={o.value}
                    value={o.value === '' ? ICON_NONE : o.value}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-dim outline-none transition-colors data-[highlighted]:bg-neon/10 data-[highlighted]:text-neon data-[state=checked]:text-neon"
                  >
                    <Icon size={15} className="text-faint data-[state=checked]:text-neon" />
                    <Select.ItemText>{o.label}</Select.ItemText>
                  </Select.Item>
                )
              })}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}

/** 错误文案条：ApiError message 原样展示 */
export function ErrBar({ text }: { text: string }) {
  return (
    <p className="mr-auto max-w-full truncate rounded-md border border-pulse/60 bg-pulse/10 px-3 py-2 text-xs text-pulse">
      {text}
    </p>
  )
}

/** 列表编辑模态框（Radix Dialog）：焦点圈定 / Esc / 遮罩关闭 / 滚动锁，HUD 四角装饰保留 */
export function FormModal({
  title,
  onClose,
  onSave,
  saveDisabled,
  children,
}: {
  title: string
  onClose: () => void
  onSave: () => void
  saveDisabled: boolean
  children: React.ReactNode
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-void/85" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-neon/40 bg-panel shadow-[0_0_24px_rgba(46,230,255,0.18)]">
          <span
            aria-hidden="true"
            className="absolute -left-2.5 -top-2.5 h-4 w-4 border-l-2 border-t-2 border-neon/60"
          />
          <span
            aria-hidden="true"
            className="absolute -right-2.5 -top-2.5 h-4 w-4 border-r-2 border-t-2 border-neon/60"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-2.5 -left-2.5 h-4 w-4 border-b-2 border-l-2 border-neon/60"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-2.5 -right-2.5 h-4 w-4 border-b-2 border-r-2 border-neon/60"
          />

          <div className="flex items-center justify-between border-b border-edge px-5 py-3">
            <Dialog.Title className="font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="关闭"
                className="text-faint transition-colors hover:text-ink"
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!saveDisabled) onSave()
            }}
            className="flex flex-col gap-4 px-5 py-5"
          >
            {children}
            <div className="mt-1 flex items-center justify-end gap-2.5">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="border border-edge px-4 py-1.5 font-mono text-xs text-dim transition-colors hover:border-neon/50 hover:text-neon"
                >
                  取消
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={saveDisabled}
                className="border border-neon/60 bg-neon/10 px-4 py-1.5 font-mono text-xs text-neon transition-colors hover:bg-neon hover:text-void disabled:pointer-events-none disabled:opacity-40"
              >
                保存
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** dnd-kit 可排序行：children 以函数式接收拖拽柄 props（触屏需 touch-none） */
export function SortableRow({
  id,
  className,
  children,
}: {
  id: string
  className?: string
  children: (handle: {
    attributes: DraggableAttributes
    listeners: SyntheticListenerMap | undefined
  }) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(className, isDragging && 'relative z-10 opacity-70')}
    >
      {children({ attributes, listeners })}
    </div>
  )
}
