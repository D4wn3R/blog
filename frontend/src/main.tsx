import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './index.css'
import './md-content.css'
import App from './App.tsx'
import { ApiError } from './lib/api'

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
