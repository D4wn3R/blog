import { useEffect, useRef, useState } from 'react'
import { Check, Copy, X } from '@phosphor-icons/react'
import { PageShell } from '../components/PageShell'
import { SectionHeading } from '../components/SectionHeading'
import { UserAvatar } from '../components/UserAvatar'
import { LoadingLine, ErrorLine, EmptyLine } from '../components/States'
import { errMsg } from '../lib/api'
import { useAbout, useFriendLinks } from '../lib/queries'
import type { AboutAggregate } from '../types/api'

// JSON 字段行：键列对齐，行尾隐约的复制按钮（悬浮变明显，点击复制字段值）
function JsonRow({
  field,
  value,
  comma = true,
}: {
  field: string
  value: string
  comma?: boolean
}) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  // 定时器清理，避免卸载后 setState
  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const copy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(value)
      } else {
        // 异步剪贴板 API 仅存在于安全上下文，HTTP 部署走 execCommand 兜底
        const ta = document.createElement('textarea')
        ta.value = value
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        ta.remove()
        if (!ok) throw new Error('execCommand copy failed')
      }
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setCopied(null), 1200)
  }

  return (
    <div className="group/row flex items-start gap-2">
      <span className="w-24 shrink-0 whitespace-nowrap text-dim">
        {'  '}
        <span className="text-neon">"{field}"</span> :
      </span>
      <span className="min-w-0 flex-1 break-all text-ink">
        "{value}"{comma ? ',' : ''}
      </span>
      <button
        type="button"
        aria-label={`复制 ${field} 的值`}
        onClick={copy}
        className="shrink-0 pt-0.5 text-faint opacity-25 transition-opacity group-hover/row:opacity-70 hover:text-neon hover:opacity-100"
      >
        {copied === 'ok' ? (
          <Check size={12} weight="bold" className="text-neon" />
        ) : copied === 'fail' ? (
          <X size={12} weight="bold" className="text-pulse" />
        ) : (
          <Copy size={12} />
        )}
      </button>
    </div>
  )
}

// #01 本节点：本站信息大卡（圆头像 HUD 角框 + 徽标 + 内嵌 about.json），数据来自 GET /api/about 的 settings
function LocalNodeCard({ settings }: { settings: AboutAggregate['settings'] }) {
  return (
    <div className="border border-edge bg-panel p-6 md:p-8">
      <div className="flex flex-col gap-8 md:flex-row md:items-start">
        <div className="relative mx-auto w-fit shrink-0 md:mx-0">
          <span
            aria-hidden="true"
            className="absolute -left-2.5 -top-2.5 h-4 w-4 border-l-2 border-t-2 border-neon/60"
          />
          <span
            aria-hidden="true"
            className="absolute -right-2.5 -top-2.5 h-4 w-4 border-r-2 border-t-2 border-neon/60"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-2.5 -left-2.5 h-4 w-4 border-b-2 border-l-2 border-neon/60"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-2.5 -right-2.5 h-4 w-4 border-b-2 border-r-2 border-neon/60"
          />
          <UserAvatar
            src={settings.site_image}
            alt="本站头像"
            className="img-cyber h-32 w-32 rounded-full border border-edge object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-1.5 border border-neon/50 px-3 py-1 font-mono text-xs text-neon">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-neon" />
              ONLINE
            </span>
            <span className="border border-edge px-3 py-1 font-mono text-xs text-faint">
              ID · 00
            </span>
          </div>
          <p className="mt-4 text-3xl font-bold tracking-tight">{settings.site_name}</p>
          <p className="mt-2 font-mono text-sm">
            <span className="text-faint">&gt; </span>
            <a
              href={settings.site_url}
              target="_blank"
              rel="noreferrer"
              className="text-neon transition-colors hover:underline"
            >
              {settings.site_url}
            </a>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-dim">{settings.site_desc}</p>
        </div>
      </div>

      <div className="mt-8 border border-dashed border-edge/80 p-5 font-mono text-[13px] leading-loose">
        <div className="text-dim">{'{'}</div>
        <div className="flex flex-col">
          <JsonRow field="name" value={settings.site_name} />
          <JsonRow field="url" value={settings.site_url} />
          <JsonRow field="desc" value={settings.site_desc} />
          <JsonRow field="image" value={settings.site_image} comma={false} />
        </div>
        <div className="text-dim">{'}'}</div>
      </div>
    </div>
  )
}

export function LinksPage() {
  const about = useAbout()
  const friends = useFriendLinks()
  const loading = about.isPending || friends.isPending
  const error = about.isError ? errMsg(about.error) : friends.isError ? errMsg(friends.error) : null
  const aboutData = about.data
  const friendList = friends.data ?? []

  return (
    <PageShell title="友情链接" path="~/links">
      {loading ? (
        <LoadingLine />
      ) : error ? (
        <ErrorLine message={error} />
      ) : (
        <>
          <SectionHeading num="#01" zh="本节点" en="Local Node" />
          {aboutData && <LocalNodeCard settings={aboutData.settings} />}

          <div className="mt-16">
            <SectionHeading num="#02" zh="已连节点" en="Linked Nodes" />
            {friendList.length === 0 ? (
              <EmptyLine text="no links yet" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {friendList.map((friend, i) => (
                  <a
                    key={friend.id}
                    href={friend.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex flex-col border border-edge bg-panel p-5 transition-colors duration-300 hover:border-neon/50"
                  >
                    <div className="flex items-center gap-3.5">
                      <UserAvatar
                        src={friend.image}
                        alt={`${friend.name} 的头像`}
                        className="img-cyber h-12 w-12 rounded-full border border-edge object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-medium">
                          <span className="truncate">{friend.name}</span>
                          <span className="flex shrink-0 items-center gap-1 border border-neon/40 px-2 py-0.5 font-mono text-[10px] text-neon">
                            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-neon" />
                            LINK
                          </span>
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-faint">
                          NODE · {String(i + 1).padStart(2, '0')}
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-dim">{friend.description}</p>
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </PageShell>
  )
}
