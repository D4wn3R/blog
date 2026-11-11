import { useEffect, useMemo, useRef } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, CalendarBlank } from '@phosphor-icons/react'
import { LoadingLine } from '../components/States'
import { errMsg, fmtDateDot } from '../lib/api'
import { renderMarkdown } from '../lib/markdown'
import { renderMermaidIn } from '../lib/mermaid'
import { useMoment } from '../lib/queries'

// 动态详情页：/moments/:id 自己拉 GET /api/moments 按 id 过滤（契约 #M1 不设单条接口）
export function MomentDetail() {
  const { id } = useParams()
  const moment = useMoment(id ?? '')
  const data = moment.data

  // 正文复用文章同一条 Markdown 链路（同一 markdown-it + DOMPurify 实例），
  // 裸 URL 自动链接、fenced code、公式与 Mermaid 规则与文章完全一致
  const html = useMemo(() => (data ? renderMarkdown(data.content) : ''), [data])
  // 同一个 memo 理由见 ArticleDetail：避免每次渲染重置 innerHTML
  const innerHtml = useMemo(() => ({ __html: html }), [html])
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (bodyRef.current) void renderMermaidIn(bodyRef.current)
  }, [html])

  if (moment.isPending) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <LoadingLine className="py-0" />
      </div>
    )
  }

  if (moment.isError || !data) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14 text-center">
        <p className="font-mono text-sm text-pulse">
          {moment.isError ? `error: ${errMsg(moment.error)}` : 'moment not found'}
        </p>
        <Link
          to="/moments"
          className="mt-4 inline-block font-mono text-sm text-neon hover:underline"
        >
          $ cd ~/moments
        </Link>
      </div>
    )
  }

  return (
    <article className="mx-auto w-full max-w-2xl px-6 py-14">
      <Link
        to="/moments"
        className="inline-flex items-center gap-2 font-mono text-xs text-faint transition-colors hover:text-neon"
      >
        <ArrowLeft size={13} />$ cd ~/moments
      </Link>

      <time className="mt-8 block font-mono text-sm text-faint">
        <CalendarBlank size={13} className="mr-1.5 inline-block -translate-y-px" />
        {fmtDateDot(data.created_at)}
      </time>

      <div
        ref={bodyRef}
        className="md-content md-cyber mt-5"
        dangerouslySetInnerHTML={innerHtml}
      />

      {data.images.length === 1 ? (
        <div className="cyber-media mt-8 border border-edge">
          <img src={data.images[0]} alt="动态配图" className="w-full object-cover" loading="lazy" />
        </div>
      ) : data.images.length > 1 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {data.images.map((src) => (
            <div key={src} className="cyber-media border border-edge">
              <img src={src} alt="动态配图" className="w-full object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}
