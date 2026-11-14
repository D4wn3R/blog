import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { reloadOnceForStaleChunk } from './lib/chunkReload'

import { Toaster } from 'sonner'
import './index.css'
import './md-content.css'
import App from './App.tsx'
import { ApiError } from './lib/api'

interface PreloadErrorEvent extends Event {
  payload?: unknown
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 4xx 业务错误（404/401/422…）重试无意义，只对网络异常与 5xx 重试一次
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        return failureCount < 1
      },
    },
  },
})

// Vite 预载失败（路由懒加载 chunk 404 等，不经过 ErrorBoundary 渲染期路径）：
// 复用同一守卫自愈刷新。Vite 事件的 payload 字段为原始 Error。
document.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForStaleChunk((event as PreloadErrorEvent).payload)) event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      {/* 全站通知：sonner，右下角紧凑样式（不遮挡页头），按赛博朋克主题定制 */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast:
              '!rounded-lg !border !border-neon/40 !bg-panel !shadow-[0_0_24px_rgba(46,230,255,0.15)]',
            title: '!font-sans !text-sm !text-ink',
            description: '!text-dim',
            success: '!border-neon/60',
            error: '!border-pulse/60',
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
)
