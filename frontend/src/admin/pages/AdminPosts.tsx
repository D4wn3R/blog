import { useState } from 'react'
import { LockSimple, Plus, PushPin } from '@phosphor-icons/react'
import { errMsg, fmtDate } from '../../lib/api'
import { cn } from '../../lib/cn'
import {
  Badge,
  Button,
  EmptyState,
  LinkButton,
  Pagination,
  PageHeader,
  Row,
  Table,
  cell,
} from '../components/ui'
import {
  useAdminArticleCounts,
  useAdminArticles,
  useDeleteArticle,
  useToggleArticleStatus,
} from '../queries'
import { ConfirmDeleteButton } from './about/parts'
import type { AdminArticleListItem } from '../../types/api'

type TabKey = 'all' | '1' | '2'

// 契约 D-hard-delete：物理删除无回收站，status 仅 1 发布 / 2 隐藏两态
const STATUS_TABS: { key: TabKey; label: string; status?: 1 | 2 }[] = [
  { key: 'all', label: '全部' },
  { key: '1', label: '已发布', status: 1 },
  { key: '2', label: '已隐藏', status: 2 },
]

export function AdminPosts() {
  const [tab, setTab] = useState<TabKey>('all')
  const [page, setPage] = useState(1)
  const [rowErr, setRowErr] = useState<string | null>(null)

  const status = tab === 'all' ? undefined : (Number(tab) as 1 | 2)
  const postsQuery = useAdminArticles(page, status)
  const countsQuery = useAdminArticleCounts()
  const toggleStatus = useToggleArticleStatus()
  const removePost = useDeleteArticle()

  const data = postsQuery.data ?? null
  const busy = toggleStatus.isPending || removePost.isPending

  // tab 上的计数（失败计 null 展示 —）
  const countFor = (key: TabKey): number | null => {
    const c = countsQuery.data
    if (!c) return null
    return key === 'all' ? c.all : key === '1' ? c.published : c.hidden
  }

  // 切 tab 回第一页
  const switchTab = (key: TabKey) => {
    setTab(key)
    setPage(1)
  }

  const onToggle = async (post: AdminArticleListItem) => {
    if (busy) return
    setRowErr(null)
    try {
      await toggleStatus.mutateAsync(post)
    } catch (e) {
      setRowErr(errMsg(e))
    }
  }

  // 物理删除不可恢复；已删除 → 404 文案透出
  const onRemove = async (id: number) => {
    if (busy) return
    setRowErr(null)
    try {
      await removePost.mutateAsync(id)
      // 当前页删空时回退一页
      if (data && data.list.length === 1 && page > 1) setPage(page - 1)
    } catch (e) {
      setRowErr(errMsg(e))
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 10)) : 1

  return (
    <div className="p-8">
      <PageHeader
        title="文章管理"
        actions={
          <LinkButton variant="primary" to="/admin/posts/edit">
            <Plus size={15} weight="bold" />
            写文章
          </LinkButton>
        }
      />

      <div className="mt-6 flex flex-wrap gap-2">
        {STATUS_TABS.map(({ key, label }) => {
          const selected = tab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => switchTab(key)}
              className={cn(
                'flex h-9 items-center gap-2 rounded-md border px-3.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/40',
                selected
                  ? 'border-neon/60 bg-neon/10 text-neon'
                  : 'border-edge text-dim hover:border-neon/40 hover:text-ink',
              )}
            >
              {label}
              <span className={cn('font-mono text-xs', selected ? 'opacity-90' : 'text-faint')}>
                {countFor(key) ?? '—'}
              </span>
            </button>
          )
        })}
      </div>

      {rowErr && (
        <p className="mt-4 rounded-md border border-pulse/60 bg-pulse/10 px-4 py-2.5 text-sm text-pulse">
          {rowErr}
        </p>
      )}

      <div className="mt-5">
        {postsQuery.isPending ? (
          <div className="rounded-xl border border-edge bg-panel px-5 py-12 text-center text-sm text-faint">
            加载中…
          </div>
        ) : postsQuery.isError ? (
          <div className="rounded-xl border border-pulse/40 bg-panel px-5 py-12 text-center text-sm text-pulse">
            {errMsg(postsQuery.error)}
          </div>
        ) : data && data.list.length > 0 ? (
          <Table
            head={[
              { label: '标题 / SLUG' },
              { label: '分类' },
              { label: '状态' },
              { label: '浏览', className: 'text-right' },
              { label: '操作', className: 'text-right' },
            ]}
          >
            {data.list.map((post) => (
              <Row key={post.id}>
                <td className={cell()}>
                  <p className="flex items-center gap-2 font-medium text-ink">
                    {post.pinned && (
                      <PushPin size={13} weight="fill" className="shrink-0 text-pulse" />
                    )}
                    {post.has_password && (
                      <LockSimple size={13} weight="fill" className="shrink-0 text-pulse" />
                    )}
                    {post.title}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-faint">
                    /posts/{post.slug} · {fmtDate(post.created_at)}
                  </p>
                </td>
                <td className={cn(cell(), 'text-dim')}>{post.category_name}</td>
                <td className={cell()}>
                  {post.status === 1 ? (
                    <Badge tone="success" dot>
                      已发布
                    </Badge>
                  ) : (
                    <Badge tone="warning" dot>
                      已隐藏
                    </Badge>
                  )}
                </td>
                <td className={cn(cell('right'), 'font-mono text-dim')}>{post.views}</td>
                <td className={cell('right')}>
                  <div className="flex items-center justify-end gap-1">
                    <LinkButton variant="ghost" size="sm" to={`/admin/posts/edit?id=${post.id}`}>
                      编辑
                    </LinkButton>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void onToggle(post)}
                    >
                      {post.status === 1 ? '隐藏' : '发布'}
                    </Button>
                    <ConfirmDeleteButton
                      name={post.title || '文章'}
                      disabled={busy}
                      onConfirm={() => void onRemove(post.id)}
                    />
                  </div>
                </td>
              </Row>
            ))}
          </Table>
        ) : (
          <EmptyState
            title="暂无文章"
            description="// 发布第一篇，C 端即刻可见"
            action={{ label: '写文章', onClick: () => window.location.assign('/admin/posts/edit') }}
          />
        )}
      </div>

      {data && data.total > 10 && (
        <div className="mt-5">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}

      <p className="mt-4 font-mono text-xs text-faint">
        // 删除为物理删除不可恢复；隐藏仅 C 端不可见，B 端仍可编辑
      </p>
    </div>
  )
}
