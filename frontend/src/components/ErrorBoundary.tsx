import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ErrorBoundary as ReactErrorBoundary, type FallbackProps } from 'react-error-boundary'

// 渲染期异常兜底：react-error-boundary 实现（规范对照表：禁止手写 class 组件兜底）。
// resetKeys 传路由 pathname：路由切换即重置错误态，避免单次渲染错误永久卡死 SPA
function RenderErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 px-6">
      <div className="border border-pulse/60 bg-pulse/10 px-6 py-4">
        <p className="font-mono text-xs text-pulse">
          render error: {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="border border-edge px-5 py-2 font-mono text-sm text-dim transition-colors hover:border-neon/40 hover:text-neon"
        >
          重试
        </button>
        <Link
          to="/"
          className="border border-neon/60 bg-neon/10 px-5 py-2 font-mono text-sm text-neon transition-colors hover:bg-neon hover:text-void"
        >
          返回首页
        </Link>
      </div>
    </div>
  )
}

export function ErrorBoundary({
  resetKeys,
  children,
}: {
  resetKeys?: unknown[]
  children: ReactNode
}) {
  return (
    <ReactErrorBoundary
      FallbackComponent={RenderErrorFallback}
      onError={(error) => console.error(error)}
      resetKeys={resetKeys}
    >
      {children}
    </ReactErrorBoundary>
  )
}
