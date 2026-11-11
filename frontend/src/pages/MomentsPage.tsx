import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router'
import { PageShell } from '../components/PageShell'
import { LoadingLine, EmptyLine, ErrorLine } from '../components/States'
import { errMsg, fmtDateDot } from '../lib/api'
import { renderMarkdown } from '../lib/markdown'
import { renderMermaidIn } from '../lib/mermaid'
import { useMoments } from '../lib/queries'
import type { MomentDTO } from '../types/api'

// 单条动态卡片：正文走与文章一致的 Markdown 渲染（裸 URL 可点、fenced code 同款样式）。
// 卡片本体不能是 <a>——正文里可能出现 Markdown 链接，<a> 嵌套 <a> 是非法 HTML 且点击互相拦截；
// 详情跳转由右上角独立 Link 承担，图片/正文链接互不遮挡
function MomentCard({ moment }: { moment: MomentDTO }) {
  const html = useMemo(() => renderMarkdown(moment.content), [moment.content])
  // 列表重渲染频繁（滚动/查询刷新）：memo 后只有正文变化才重建 DOM
  const innerHtml = useMemo(() => ({ __html: html }), [html])
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (bodyRef.current) void renderMermaidIn(bodyRef.current)
  }, [html])

  return (
    <div className="border-l-2 border-edge p-6 transition-colors duration-300 hover:border-neon/60 hover:bg-panel/60 md:p-7">
      <div className="flex items-baseline justify-between gap-4">
        <time className="font-mono text-xs text-faint">{fmtDateDot(moment.created_at)}</time>
        <Link
          to={`/moments/${moment.id}`}
          className="shrink-0 font-mono text-xs text-faint transition-colors hover:text-neon"
        >
          阅读全文
        </Link>
      </div>
      <div
        ref={bodyRef}
        className="md-content md-cyber mt-3 max-w-[42em]"
        dangerouslySetInnerHTML={innerHtml}
      />
      {moment.images[0] && (
        <div className="cyber-media mt-5 max-w-xl border border-edge">
          <img
            src={moment.images[0]}
            alt="动态配图"
            loading="lazy"
            className="aspect-[16/9] object-cover"
          />
        </div>
      )}
    </div>
  )
}

export function MomentsPage() {
  const moments = useMoments()
  const list = moments.data ?? []

  return (
    <PageShell title="动态" path="~/moments">
      {moments.isPending ? (
        <LoadingLine />
      ) : moments.isError ? (
        <ErrorLine message={errMsg(moments.error)} onRetry={() => void moments.refetch()} />
      ) : list.length === 0 ? (
        <EmptyLine text="no moments yet" />
      ) : (
        <div className="flex flex-col gap-10">
          {list.map((moment) => (
            <MomentCard key={moment.id} moment={moment} />
          ))}
        </div>
      )}
    </PageShell>
  )
}