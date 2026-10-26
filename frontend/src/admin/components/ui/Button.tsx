import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router'
import { CircleNotch } from '@phosphor-icons/react'
import { cn } from '../../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-neon font-medium text-void hover:bg-neon/85',
  secondary: 'border border-edge bg-panel text-dim hover:border-neon/50 hover:text-ink',
  danger: 'border border-pulse/50 bg-pulse/10 text-pulse hover:bg-pulse hover:text-void',
  ghost: 'text-dim hover:bg-panel-2 hover:text-ink',
}

// Button 与 LinkButton 共享的视觉基线
function buttonCls(variant: ButtonVariant, size: 'sm' | 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/40',
    'disabled:pointer-events-none disabled:opacity-50',
    size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm',
    VARIANTS[variant],
    className,
  )
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  loading?: boolean
}

// B 端按钮：36px 触控目标、focus ring、loading 态（提交中防重复点击）
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    disabled,
    className,
    children,
    type,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      className={buttonCls(variant, size, className)}
      {...rest}
    >
      {loading && <CircleNotch size={14} weight="bold" className="animate-spin" />}
      {children}
    </button>
  )
})

export interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
}

// 路由跳转按钮（react-router Link + Button 视觉），替代 button 包 a 的无效嵌套
export function LinkButton({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link className={buttonCls(variant, size, className)} {...rest}>
      {children}
    </Link>
  )
}
