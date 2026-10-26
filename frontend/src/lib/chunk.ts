// 部署换代后，旧 SPA 会话按旧 hash 请求动态 chunk 会 404
// （Chrome 文案 "Failed to fetch dynamically imported module"）：
// 捕获该错误时整页刷新拿新 index.html 一次（sessionStorage 防循环刷新），其余错误原样上抛
const STALE_CHUNK_KEY = 'blog.stale-chunk-reloaded'

export function guardStaleChunk<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      return await load()
    } catch (e) {
      if (
        e instanceof TypeError &&
        e.message.includes('dynamically imported module') &&
        !sessionStorage.getItem(STALE_CHUNK_KEY)
      ) {
        sessionStorage.setItem(STALE_CHUNK_KEY, '1')
        window.location.reload()
      }
      throw e
    }
  }
}
