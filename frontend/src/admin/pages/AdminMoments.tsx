import { useState } from 'react'
import { ImageSquare, PencilSimple, Plus, TrashSimple } from '@phosphor-icons/react'
import { errMsg, fmtDateDot } from '../../lib/api'
import { useAdminMoments, useDeleteMoment } from '../queries'
import { Card, EmptyState, LinkButton, Pagination, PageHeader } from '../components/ui'

// 动态管理：#M1 分页列表（缩略图取 images[0]）+ #M4 删除（物理删除，不存在幂等成功）
export function AdminMoments() {
  const [page, setPage] = useState(1)

  const momentsQuery = useAdminMoments(page)
  const removeMoment = useDeleteMoment()

  const data = momentsQuery.data ?? null

  const onRemove = async (id: number) => {
    try {
      await removeMoment.mutateAsync(id)
      // 当前页删空时回退一页
      if (data && data.list.length === 1 && page > 1) setPage(page - 1)
    } catch {
      // 错误经 mutation isError 展示，无需在此处理
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1

  return (
    <div className="p-8">
      <PageHeader
        title="动态管理"
        actions={
          <LinkButton variant="primary" to="/admin/moments/new">
            <Plus size={14} weight="bold" />
            发动态
          </LinkButton>
        }
      />

      {removeMoment.isError && (
        <p className="mt-4 rounded-md border border-pulse/60 bg-pulse/10 px-4 py-2.5 text-sm text-pulse">
          {errMsg(removeMoment.error)}
        </p>
      )}

      <div className="mt-6">
        {momentsQuery.isPending ? (
          <p className="text-sm text-faint">加载中…</p>
        ) : momentsQuery.isError ? (
          <p className="text-sm text-pulse">{errMsg(momentsQuery.error)}</p>
        ) : data && data.list.length > 0 ? (
          <Card className="divide-y divide-edge/60">
            {data.list.map((moment) => (
              <div
                key={moment.id}
                className="flex items-start gap-4 p-5 transition-colors hover:bg-panel-2"
              >
                {moment.images.length > 0 ? (
                  <img
                    src={moment.images[0]}
                    alt="动态配图"
                    className="img-cyber h-14 w-24 shrink-0 rounded-md border border-edge object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md border border-edge text-faint">
                    <ImageSquare size={16} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-faint">{fmtDateDot(moment.created_at)}</p>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink">
                    {moment.content}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <LinkButton
                    variant="ghost"
                    size="sm"
                    to={`/admin/moments/${moment.id}/edit`}
                    aria-label="编辑动态"
                    className="h-8 w-8 !px-0"
                  >
                    <PencilSimple size={14} />
                  </LinkButton>
                  <button
                    type="button"
                    aria-label="删除动态"
                    title="删除动态"
                    disabled={removeMoment.isPending}
                    onClick={() => void onRemove(moment.id)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-edge text-faint transition-colors hover:border-pulse/60 hover:text-pulse disabled:pointer-events-none disabled:opacity-40"
                  >
                    <TrashSimple size={14} />
                  </button>
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState
            title="暂无动态"
            description="// 记录第一件事，C 端即刻可见"
            action={{
              label: '发动态',
              onClick: () => window.location.assign('/admin/moments/new'),
            }}
          />
        )}
      </div>

      {data && data.total > 20 && (
        <div className="mt-5">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
