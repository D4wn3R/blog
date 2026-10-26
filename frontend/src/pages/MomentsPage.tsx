import { Link } from 'react-router'
import { PageShell } from '../components/PageShell'
import { LoadingLine, EmptyLine, ErrorLine } from '../components/States'
import { errMsg, fmtDateDot } from '../lib/api'
import { useMoments } from '../lib/queries'

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
            <Link
              key={moment.id}
              to={`/moments/${moment.id}`}
              className="border-l-2 border-edge p-6 transition-colors duration-300 hover:border-neon/60 hover:bg-panel/60 md:p-7"
            >
              <time className="font-mono text-xs text-faint">{fmtDateDot(moment.created_at)}</time>
              <p className="mt-3 max-w-[42em] whitespace-pre-wrap break-words leading-relaxed text-ink">
                {moment.content}
              </p>
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
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  )
}
