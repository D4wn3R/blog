// 旧入口 chunk 404 自愈（部署切换全量换镜像后，持有旧入口 JS 的会话懒加载路由 404）。
// 独立于 ErrorBoundary 也可被 main.tsx 的 vite:preloadError 监听复用。

const CHUNK_RELOAD_KEY = 'blog-chunk-reloaded'

export function isStaleChunkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    /Failed to fetch dynamically imported module/.test(msg) ||
    /Importing a module script failed/.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  )
}

// 整页刷新拿新入口；sessionStorage 守卫防循环（同会话仅一次）。
// sessionStorage 不可用（隐私模式等）时不刷新——刷新循环比展示错误危害更大。
export function reloadOnceForStaleChunk(error: unknown): boolean {
  if (!isStaleChunkError(error)) return false
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return false
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
  } catch {
    return false
  }
  window.location.reload()
  return true
}
