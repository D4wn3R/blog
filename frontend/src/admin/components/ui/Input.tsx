import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '../../../lib/cn'
import { isSubmitEnter } from '../../../lib/keyboard'

// 表单控件公共基线：36px 高、圆角、霓虹 focus、错误态 pulse 边框。
// 直接透传 props（ref/onChange/…），与 react-hook-form register 完全兼容

export const fieldBase =
  'w-full rounded-md border bg-void text-sm text-ink placeholder:text-faint transition-colors ' +
  'focus:outline-none focus:ring-2 disabled:opacity-50'

function tone(error?: boolean) {
  return error
    ? 'border-pulse/60 focus:border-pulse/60 focus:ring-pulse/20'
    : 'border-edge focus:border-neon/60 focus:ring-neon/20'
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, className, ...rest },
  ref,
) {
  return <input ref={ref} {...rest} className={cn(fieldBase, 'h-9 px-3', tone(error), className)} />
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
  // 回车提交（Shift+回车换行）；未传时回车提交最近的父级表单
  onEnterSubmit?: () => void
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { error, className, onKeyDown, onEnterSubmit: submit, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      {...rest}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.defaultPrevented || !isSubmitEnter(e)) return
        const form = e.currentTarget.form
        if (!submit && !form) return
        e.preventDefault()
        if (submit) submit()
        else form?.requestSubmit()
      }}
      className={cn(fieldBase, 'resize-none px-3 py-2 leading-relaxed', tone(error), className)}
    />
  )
})

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
}

export const NativeSelect = forwardRef<HTMLSelectElement, SelectProps>(function NativeSelect(
  { error, className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} {...rest} className={cn(fieldBase, 'h-9 px-3', tone(error), className)}>
      {children}
    </select>
  )
})

export interface DateFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> {
  error?: boolean
  // YYYY-M-D（不补零，契约格式）或 undefined；date 控件要求的 YYYY-MM-DD 由内部归一
  value?: string
}

// 赛博朋克日期控件：原生 date 选择器 + color-scheme dark 适配暗色日历弹窗；
// 配 react-hook-form Controller 使用（受控值经 normalizeDate 转补零，onChange 输出 YYYY-MM-DD，
// 后端 Parse 兼容补零/不补零）
export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(function DateField(
  { error, className, value, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="date"
      style={{ colorScheme: 'dark' }}
      value={normalizeDate(value)}
      {...rest}
      className={cn(fieldBase, 'h-9 px-3 font-mono', tone(error), className)}
    />
  )
})

function normalizeDate(v: string | undefined): string {
  if (!v) return ''
  const p = v.split('-')
  if (p.length !== 3) return v
  return `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`
}
