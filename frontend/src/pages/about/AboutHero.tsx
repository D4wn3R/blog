import { useRef } from 'react'
import { Coffee, Database, Gear, Lightning } from '@phosphor-icons/react'
import { animate, stagger } from 'animejs'
import { splitTitleEn } from '../../components/Hero'
import { useEntrance } from '../../lib/anime'
import type { AboutAggregate } from '../../types/api'

// 关于页 Hero 区（头像 HUD 角框 + 品牌宣言）与技能卡：从 AboutPage 拆出的展示组件
// 头像统一取 settings.site_image（与友链页本节点同源，B 端在友链管理编辑）

export const SKILL_ICONS = [Coffee, Lightning, Database, Gear] as const

export function SectionTitle({ num, en }: { num: string; en: string }) {
  return (
    <div className="mb-10">
      <p className="font-mono text-sm text-faint">{num}</p>
      <h2 className="mt-1 text-3xl font-bold tracking-tight">{en}</h2>
    </div>
  )
}

function HudAvatar({ src, nickname }: { src: string; nickname: string }) {
  const corners = [
    'left-0 top-0 border-l-2 border-t-2',
    'right-0 top-0 border-r-2 border-t-2',
    'bottom-0 left-0 border-b-2 border-l-2',
    'bottom-0 right-0 border-b-2 border-r-2',
  ]
  return (
    <div className="relative">
      {corners.map((c) => (
        <span
          key={c}
          aria-hidden="true"
          className={`absolute h-5 w-5 border-neon/70 ${c}`}
          style={{ margin: '-6px' }}
        />
      ))}
      {src ? (
        <img
          src={src}
          alt={`${nickname} 的头像`}
          className="img-cyber h-56 w-56 object-cover md:h-64 md:w-64"
          loading="lazy"
        />
      ) : (
        <div className="img-cyber h-56 w-56 md:h-64 md:w-64" />
      )}
    </div>
  )
}

export function AboutHero({
  profile,
  settings,
}: {
  profile: AboutAggregate['profile']
  settings: AboutAggregate['settings']
}) {
  const title = splitTitleEn(profile.title_en)
  const tagsRef = useRef<HTMLDivElement>(null)

  // 技能标签弹入：AboutPage 仅在数据就绪后挂载本组件，入场时机稳定
  // （标签是 flex 子项天然 blockified，可直接承载 transform）
  useEntrance(() => {
    const items = tagsRef.current?.children
    if (!items?.length) return
    return animate([...items], {
      opacity: [0, 1],
      scale: [0.55, 1],
      duration: 520,
      ease: 'outBack',
      delay: stagger(60, { start: 420 }),
    })
  })

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl gap-14 px-6 pb-16 pt-14 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-8">
          <p className="mb-5 inline-block border border-edge bg-panel px-3 py-1.5 font-mono text-xs text-dim">
            <span className="text-neon">✓</span> DNS · Server · API services running
            <span className="ml-3 text-faint">coffee: brewing</span>
          </p>
          <p className="mb-2 font-mono text-sm text-faint">
            $ ~/D4wn3R <span className="text-neon">$ whoami</span>
          </p>
          <p className="text-lg text-dim">
            你好，我是
            <span className="text-glow ml-3 font-mono text-5xl font-bold text-neon md:text-6xl">
              {profile.nickname}
            </span>
          </p>
          <p className="mt-5 text-xl font-semibold text-ink md:text-2xl">
            {title.head} {title.accent && <span className="text-neon">{title.accent}</span>}
          </p>
          <div ref={tagsRef} className="mt-8 flex flex-wrap gap-2.5">
            {['Java', 'Go', 'Spring Boot', 'Gin', 'MySQL', 'Redis'].map((tag) => (
              <span
                key={tag}
                className="border border-edge px-3.5 py-1.5 font-mono text-xs text-dim transition-colors hover:border-neon/50 hover:text-neon"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="justify-self-start lg:col-span-4 lg:justify-self-end">
          <HudAvatar src={settings.site_image} nickname={profile.nickname} />
        </div>
      </div>

      <div className="overflow-hidden border-y border-edge bg-panel/60 py-3.5">
        <div className="animate-marquee flex w-max gap-10 font-mono text-xs text-dim">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 gap-10" aria-hidden={copy === 1}>
              {[
                'Full-Stack // Backend Craft',
                'D4wn3R_CN',
                'email open to chat',
                'Go · Java · Cloud',
                'output powered by coffee',
              ].map((text) => (
                <span key={text} className="flex items-center gap-10">
                  <span className="text-neon">◆</span>
                  {text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
