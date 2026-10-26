import { Link, useSearchParams } from 'react-router'
import { LockSimple } from '@phosphor-icons/react'
import { PageShell } from '../components/PageShell'
import { LoadingLine, EmptyLine, ErrorLine } from '../components/States'
import { errMsg, fmtDateDot } from '../lib/api'
import { cn } from '../lib/cn'
import { useAllArticles } from '../lib/queries'
import type { ArticleListItem } from '../types/api'

// 结构对齐参考站 Firefly 主题的 ArchivePanel：
// 年头（年份 + 空心圆点 + 计数）→ 每篇一行（日期 / 虚线圆点 / 标题 / #tags）
interface YearGroup {
  year: string
  items: ArticleListItem[]
}

function groupByYear(list: ArticleListItem[]): YearGroup[] {
  const map = new Map<string, ArticleListItem[]>()
  for (const post of [...list].sort((a, b) =>
    (a.published_at ?? '') < (b.published_at ?? '') ? 1 : -1,
  )) {
    const year = post.published_at ? fmtDateDot(post.published_at).slice(0, 4) : ''
    if (!year) continue
    const bucket = map.get(year)
    if (bucket) bucket.push(post)
    else map.set(year, [post])
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([year, items]) => ({ year, items }))
}

export function ArchivePage() {
  // 分类筛选进 URL（规范：能 URL 表达的状态不进 useState）
  const [searchParams, setSearchParams] = useSearchParams()
  const active = searchParams.get('cat') ?? '全部'
  const setActive = (cat: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (cat && cat !== '全部') next.set('cat', cat)
        else next.delete('cat')
        return next
      },
      { replace: true },
    )

  const posts = useAllArticles()
  const list = posts.data ?? []

  const categories = ['全部', ...new Set(list.map((p) => p.category_name))]
  const filtered = active === '全部' ? list : list.filter((p) => p.category_name === active)
  const groups = groupByYear(filtered)

  return (
    <PageShell title="归档" path="~/archive">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => {
            const count =
              cat === '全部' ? list.length : list.filter((p) => p.category_name === cat).length
            const selected = active === cat
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActive(cat)}
                className={cn(
                  'border px-3 py-1.5 font-mono text-xs transition-colors',
                  selected
                    ? 'border-neon/60 bg-neon/10 text-neon'
                    : 'border-edge text-dim hover:border-neon/40 hover:text-neon',
                )}
              >
                {cat} <span className="ml-1 opacity-70">{count}</span>
              </button>
            )
          })}
        </div>
        <span className="font-mono text-xs text-faint">
          {filtered.length} 篇文章 · {groups.length} 年
        </span>
      </div>

      <div className="border border-edge bg-panel px-5 py-6 md:px-8">
        {posts.isPending ? (
          <LoadingLine />
        ) : posts.isError ? (
          <ErrorLine message={errMsg(posts.error)} onRetry={() => void posts.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyLine text="no posts yet" />
        ) : (
          groups.map((group) => (
            <div key={group.year}>
              <div className="flex h-14 items-center">
                <div className="w-[22%] text-right text-2xl font-bold md:w-[10%]">{group.year}</div>
                <div className="w-[14%] md:w-[10%]">
                  <div className="mx-auto h-3 w-3 rounded-full outline-[3px] outline-neon -outline-offset-2" />
                </div>
                <div className="text-sm text-dim">{group.items.length} 篇文章</div>
              </div>

              {group.items.map((post) => (
                <Link
                  key={post.id}
                  to={`/posts/${post.slug}`}
                  aria-label={post.title}
                  className="group flex h-12 items-center"
                >
                  <div className="w-[18%] font-mono text-sm text-faint transition-colors group-hover:text-dim md:w-[10%]">
                    {fmtDateDot(post.published_at).slice(5)}
                  </div>

                  <div className="relative flex h-full w-[14%] items-center justify-center md:w-[10%]">
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 border-l border-dashed border-edge" />
                    <div className="relative h-1 w-1 rounded-full bg-faint transition-all duration-300 group-hover:h-5 group-hover:bg-neon" />
                  </div>

                  <div className="w-[68%] truncate pr-4 font-bold transition-all group-hover:translate-x-1 group-hover:text-neon md:w-[55%] md:pr-6">
                    {post.has_password && (
                      <LockSimple
                        size={13}
                        weight="fill"
                        className="mr-2 inline-block text-pulse"
                      />
                    )}
                    {post.title}
                  </div>

                  <div className="hidden truncate font-mono text-sm text-faint md:block md:w-[15%]">
                    {post.tags.map((t) => `#${t}`).join(' ')}
                  </div>
                </Link>
              ))}
            </div>
          ))
        )}
      </div>
    </PageShell>
  )
}
