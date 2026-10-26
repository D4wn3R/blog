import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { PageShell } from '../components/PageShell'
import { PostList } from '../components/PostList'
import { LoadingLine, EmptyLine, ErrorLine } from '../components/States'
import { errMsg } from '../lib/api'
import { cn } from '../lib/cn'
import { useArticleList, useCategories } from '../lib/queries'

// 筛选与搜索词进 URL（规范：能用 URL 表达的状态不进 useState）——
// 刷新/分享不丢；搜索输入为避免历史记录噪音用 replace 写回
export function PostsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const catId = Number(searchParams.get('cat') ?? '') || 0
  const query = searchParams.get('q') ?? ''

  // 输入框的中间态（未防抖），400ms 后写入 URL
  const [keywordInput, setKeywordInput] = useState(query)

  const categories = useCategories()
  const posts = useArticleList({ categoryId: catId, keyword: query })

  useEffect(() => {
    const t = setTimeout(() => {
      const q = keywordInput.trim()
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (q) next.set('q', q)
          else next.delete('q')
          return next
        },
        { replace: true },
      )
    }, 400)
    return () => clearTimeout(t)
  }, [keywordInput, setSearchParams])

  const setCat = (id: number) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('cat', String(id))
        else next.delete('cat')
        return next
      },
      { replace: true },
    )

  const list = posts.data ?? []

  return (
    <PageShell title="文章" path="~/posts">
      {categories.isError && (
        <p className="mb-4 font-mono text-sm text-pulse">
          error: {errMsg(categories.error)}（分类筛选条不可用）
        </p>
      )}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {[{ id: 0, name: '全部' }, ...(categories.data ?? [])].map((cat) => {
            const selected = catId === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCat(cat.id)}
                className={cn(
                  'border px-3 py-1.5 font-mono text-xs transition-colors',
                  selected
                    ? 'border-neon/60 bg-neon/10 text-neon'
                    : 'border-edge text-dim hover:border-neon/40 hover:text-neon',
                )}
              >
                {cat.name}
              </button>
            )
          })}
        </div>
        <input
          type="search"
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          placeholder="$ grep ..."
          aria-label="搜索文章"
          className="w-44 border border-edge bg-void px-3 py-1.5 font-mono text-xs text-ink placeholder:text-faint focus:border-neon/60 focus:outline-none"
        />
      </div>

      {posts.isPending ? (
        <LoadingLine />
      ) : posts.isError ? (
        <ErrorLine message={errMsg(posts.error)} onRetry={() => void posts.refetch()} />
      ) : list.length === 0 ? (
        <EmptyLine text="no posts found" />
      ) : (
        <PostList posts={list} />
      )}
    </PageShell>
  )
}
