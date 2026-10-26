import { useRef } from 'react'
import { Link } from 'react-router'
import { Clock, LockSimple, PushPin } from '@phosphor-icons/react'
import { animate, stagger } from 'animejs'
import { fmtDateDot } from '../lib/time'
import { cn } from '../lib/cn'
import { useEntrance } from '../lib/anime'
import type { ArticleListItem } from '../types/api'

// 置顶优先，其余按发布时间降序（后端同序，此处兜底保证任何来源一致）
function sortPosts(list: ArticleListItem[]): ArticleListItem[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned)
    return (a.published_at ?? '') < (b.published_at ?? '') ? 1 : -1
  })
}

function PostRow({ post }: { post: ArticleListItem }) {
  return (
    <Link
      to={`/posts/${post.slug}`}
      className={cn(
        // transition-all 会与 anime.js 入场写入的内联 transform/opacity 打架，这里只做颜色过渡
        'group grid grid-cols-1 gap-2 border-l-2 border-transparent py-7 pl-5 pr-2 transition-colors duration-300 hover:border-neon hover:bg-panel/60 md:items-center md:gap-6',
        post.cover_url ? 'md:grid-cols-[7rem_1fr_auto_10rem]' : 'md:grid-cols-[7rem_1fr_auto]',
      )}
    >
      <time className="font-mono text-sm text-faint transition-colors group-hover:text-dim">
        {fmtDateDot(post.published_at)}
      </time>

      <div className="transition-transform duration-300 group-hover:translate-x-1">
        <h3 className="mb-1.5 flex items-center gap-2.5 text-lg font-medium leading-snug transition-colors group-hover:text-neon">
          {post.pinned && <PushPin size={15} weight="fill" className="shrink-0 text-pulse" />}
          {post.has_password && (
            <LockSimple size={16} weight="fill" className="shrink-0 text-pulse" />
          )}
          {post.title}
        </h3>
        <p className="line-clamp-1 text-sm text-dim">
          {post.has_password ? '本文已加密，输入密码后可查看全文。' : post.summary}
        </p>
      </div>

      <div className="flex items-center gap-3 md:justify-end">
        <span
          className={cn(
            'border px-2 py-0.5 font-mono text-xs',
            post.has_password ? 'border-pulse/50 text-pulse' : 'border-edge text-dim',
          )}
        >
          {post.has_password ? '加密' : post.category_name}
        </span>
        <span className="hidden items-center gap-1.5 font-mono text-xs text-faint sm:flex">
          <Clock size={13} />
          {post.minutes} min
        </span>
      </div>

      {post.cover_url && (
        <img
          src={post.cover_url}
          alt={post.title}
          loading="lazy"
          className="h-40 w-full border border-edge object-cover sm:h-24 sm:w-40 sm:justify-self-end"
        />
      )}
    </Link>
  )
}

export function PostList({ posts }: { posts: ArticleListItem[] }) {
  const rootRef = useRef<HTMLDivElement>(null)

  // 行交错入场：换页/数据更新后重放（行的 hover 位移在内层 div 上，互不干扰）
  useEntrance(() => {
    const rows = rootRef.current?.children
    if (!rows?.length) return
    return animate([...rows], {
      opacity: [0, 1],
      translateX: [-26, 0],
      duration: 620,
      ease: 'outExpo',
      delay: stagger(70),
    })
  }, [posts])

  return (
    <div ref={rootRef} className="divide-y divide-edge/70 border-y border-edge/70">
      {sortPosts(posts).map((post) => (
        <PostRow key={post.id} post={post} />
      ))}
    </div>
  )
}
