import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, CalendarBlank, Clock, LockSimple, Tag } from '@phosphor-icons/react'
import { ApiError, errMsg, fmtDate } from '../../lib/api'
import { useAuthStore } from '../../lib/authStore'
import { extractToc, renderMarkdown } from '../../lib/markdown'
import { renderMermaidIn } from '../../lib/mermaid'
import { useArticle, useUnlockArticle } from '../../lib/queries'
import type { TocItem } from '../../lib/markdown'
import { CommentSection } from './CommentSection'
import { UnlockPanel } from './UnlockPanel'
import { useTocScroll } from './useTocScroll'

// 左侧目录（宽屏专属）：粘性跟随，锚点跳转 + 滚动高亮当前章节
function TocNav({ toc, activeId }: { toc: TocItem[]; activeId: string }) {
  return (
    <nav aria-label="文章目录" className="absolute inset-y-0 right-full mr-8 hidden w-52 xl:block">
      <div className="sticky top-24">
        <p className="mb-3 font-mono text-[11px] tracking-widest text-faint">$ cat toc</p>
        <ul>
          {toc.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`block border-l-2 py-1 text-xs leading-relaxed transition-colors ${
                  item.level === 3 ? 'pl-7' : item.level === 2 ? 'pl-5' : 'pl-3'
                } ${
                  activeId === item.id
                    ? 'border-neon text-neon'
                    : 'border-edge text-faint hover:text-ink'
                }`}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}

// 文章详情页：GET /api/articles/:slug（加密三态）+ 评论楼中楼（#C1-#C3）
export function ArticleDetail() {
  const { slug } = useParams()
  const slugKey = slug ?? ''

  // 登录态响应式订阅（authStore）：登录/登出即时反映到评论区
  const user = useAuthStore((s) => s.user)

  // unlock_token 进入 query key：解锁成功后 key 变化自动重拉详情
  const [unlockToken, setUnlockToken] = useState('')
  const articleQuery = useArticle(slugKey, unlockToken)
  const unlockMutation = useUnlockArticle(slugKey)

  // 切换文章时重置解锁态（unlock token 绑定文章 aid，跨文章无效）
  useEffect(() => {
    setUnlockToken('')
  }, [slugKey])

  const activeQuery = articleQuery

  const article = activeQuery.data ?? null
  const notFound =
    activeQuery.isError && activeQuery.error instanceof ApiError && activeQuery.error.code === 40400
  const loadError = activeQuery.isError && !notFound ? errMsg(activeQuery.error) : ''
  // 40100（解锁凭证无效/过期）在详情接口上单独给出语境化文案
  const tokenError =
    activeQuery.isError && activeQuery.error instanceof ApiError && activeQuery.error.code === 40100
      ? '解锁凭证无效或已过期'
      : ''
  const unlockError = unlockMutation.isError ? errMsg(unlockMutation.error) : tokenError

  const submitUnlock = (password: string) => {
    void unlockMutation
      .mutateAsync(password)
      .then((res) => setUnlockToken(res.unlock_token))
      .catch(() => {
        // 错误经 unlockMutation.isError 映射到 unlockError，无需在此处理
      })
  }

  const readable = !!article && (!article.has_password || article.unlocked)
  const content = readable && article ? article.content_md : ''
  const html = useMemo(() => renderMarkdown(content), [content])
  const toc = useMemo(() => extractToc(content), [content])
  const activeId = useTocScroll(toc)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (contentRef.current) {
      void renderMermaidIn(contentRef.current)
    }
  }, [html])

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="font-mono text-sm text-faint">article not found</p>
        <Link to="/posts" className="mt-4 inline-block font-mono text-sm text-neon hover:underline">
          $ cd ~/posts
        </Link>
      </div>
    )
  }

  if (activeQuery.isPending || !article) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-14">
        <p className="font-mono text-sm text-faint">
          {loadError ? `error: ${loadError}` : 'loading...'}
        </p>
      </div>
    )
  }

  return (
    <div className="relative mx-auto w-full max-w-3xl px-6 py-14">
      {toc.length > 0 && readable && <TocNav toc={toc} activeId={activeId} />}

      <article>
        <Link
          to="/posts"
          className="inline-flex items-center gap-2 font-mono text-xs text-faint transition-colors hover:text-neon"
        >
          <ArrowLeft size={13} />$ cd ~/posts
        </Link>

        <h1 className="mt-6 text-3xl font-bold leading-snug tracking-tight md:text-4xl">
          {article.has_password && (
            <LockSimple size={26} weight="fill" className="mr-3 inline-block text-pulse" />
          )}
          {article.title}
        </h1>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-faint">
          <span className="flex items-center gap-1.5">
            <CalendarBlank size={13} />
            {fmtDate(article.published_at).replaceAll('-', '.')}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={13} />
            {article.minutes} min
          </span>
          <span className="border border-edge px-2 py-0.5 text-dim">{article.category.name}</span>
          <span className="flex items-center gap-1.5">
            <Tag size={13} />
            {article.tags.map((t) => `#${t.name}`).join(' ')}
          </span>
        </div>

        {article.cover_url && (
          <img src={article.cover_url} alt={article.title} className="mt-8 w-full" />
        )}

        {article.has_password && !article.unlocked ? (
          /* 加密未解锁：解锁面板（密码 → POST unlock → 带 token 重拉详情） */
          <UnlockPanel
            busy={unlockMutation.isPending}
            error={unlockError}
            resetKey={unlockToken}
            onSubmit={submitUnlock}
          />
        ) : (
          <div
            ref={contentRef}
            className="md-content md-cyber mt-10"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </article>

      <hr className="my-12 border-edge" />

      <CommentSection slug={slugKey} user={user} />
    </div>
  )
}
