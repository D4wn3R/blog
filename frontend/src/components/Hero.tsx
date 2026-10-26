import { useRef } from 'react'
import { Link } from 'react-router'
import { ArrowRight } from '@phosphor-icons/react'
import { createTimeline, stagger } from 'animejs'
import { errMsg } from '../lib/api'
import { useAbout } from '../lib/queries'
import { useEntrance } from '../lib/anime'
import { HERO_ACCENT, HERO_PREFIX, HERO_TAGLINE_LINE1, HERO_TAGLINE_LINE2 } from '../lib/site'
import { UserAvatar } from './UserAvatar'
import { cn } from '../lib/cn'

// 英文头衔单字段拆两段：最后一个空格前为 head，末段高亮 accent（无空格则整段 head）
export function splitTitleEn(titleEn: string): { head: string; accent: string } {
  const i = titleEn.lastIndexOf(' ')
  return i === -1
    ? { head: titleEn, accent: '' }
    : { head: titleEn.slice(0, i), accent: titleEn.slice(i + 1) }
}

// 大标题逐字符拆分（anime.js stagger 的挂载点）：inline-block 才能承载 transform，
// 空格用 nbsp 避免折叠；accent 段沿用霓虹高亮
function TitleChars({ text, accent = false }: { text: string; accent?: boolean }) {
  return (
    <>
      {[...text].map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn('js-hero-char inline-block', accent && 'text-neon')}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </>
  )
}

export function Hero() {
  const about = useAbout()
  const rootRef = useRef<HTMLElement>(null)

  const prefix = HERO_PREFIX
  const accent = HERO_ACCENT
  const profile = about.data?.profile
  const settings = about.data?.settings
  const title = splitTitleEn(profile?.title_en ?? '')

  // 首屏入场编排：whoami → 大标题逐字符升起 → 签名句 → CTA 弹入 → 档案卡滑入
  // 目标元素全部带 js-hero-* 钩子类，anime 只写 transform/opacity，与 hover 色过渡互不干扰
  useEntrance(() => {
    const root = rootRef.current
    if (!root) return
    const $ = (s: string) => [...root.querySelectorAll(s)]
    return createTimeline({ defaults: { ease: 'outExpo' } })
      .add($('.js-hero-whoami'), { opacity: [0, 1], translateY: [14, 0], duration: 500 })
      .add(
        $('.js-hero-char'),
        { opacity: [0, 1], translateY: ['0.75em', '0em'], duration: 750, delay: stagger(38) },
        '-=250',
      )
      .add($('.js-hero-tagline'), { opacity: [0, 1], translateY: [16, 0], duration: 650 }, '-=450')
      .add(
        $('.js-hero-ctas > *'),
        { opacity: [0, 1], scale: [0.82, 1], duration: 520, ease: 'outBack', delay: stagger(110) },
        '-=350',
      )
      .add($('.js-hero-card'), { opacity: [0, 1], translateX: [56, 0], duration: 850 }, '-=600')
  })

  return (
    <section ref={rootRef} className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl gap-14 px-6 py-16 md:py-20 lg:grid-cols-12 lg:items-center lg:gap-10">
        {/* 左：品牌宣言 */}
        <div className="lg:col-span-8">
          <p className="js-hero-whoami mb-6 font-mono text-sm text-neon">$ whoami</p>
          <h1
            className="glitch mb-8 text-4xl leading-[1.15] font-bold tracking-tight sm:text-5xl md:text-6xl xl:text-7xl lg:whitespace-nowrap"
            data-text={`${prefix} ${accent}`}
            aria-label={`${prefix} ${accent}`}
          >
            <TitleChars text={`${prefix} `} />
            <TitleChars text={accent} accent />
          </h1>
          <p className="js-hero-tagline mb-10 max-w-[34em] text-base leading-relaxed text-dim md:text-lg">
            {about.isError ? (
              `error: ${errMsg(about.error)}`
            ) : about.data ? (
              <>
                {HERO_TAGLINE_LINE1}
                <br />
                {HERO_TAGLINE_LINE2}
              </>
            ) : (
              'loading...'
            )}
          </p>
          <div className="js-hero-ctas flex flex-wrap items-center gap-4">
            <Link
              to="/posts"
              className="cta-primary inline-flex items-center gap-3 border border-neon/70 px-8 py-3.5 font-mono text-base text-neon transition-colors hover:border-neon hover:text-void"
            >
              开始阅读
              <ArrowRight size={18} weight="bold" />
            </Link>
            <Link
              to="/about"
              className="inline-flex items-center gap-3 border border-edge px-8 py-3.5 font-mono text-base text-dim transition-colors hover:border-neon/60 hover:text-neon"
            >
              whoami
            </Link>
          </div>
        </div>

        {/* 右：自我介绍卡 */}
        <Link
          to="/about"
          className="js-hero-card group block border border-edge bg-panel p-6 transition-colors duration-300 hover:border-neon/50 lg:col-span-4"
          aria-label="进入关于页"
        >
          <div className="flex items-center gap-4">
            <UserAvatar
              src={settings?.site_image ?? ''}
              alt={`${profile?.nickname ?? ''} 的头像`}
              className="img-cyber h-16 w-16 shrink-0 border border-edge object-cover"
            />
            <div>
              <p className="font-mono text-xs text-neon">$ whoami</p>
              <p className="mt-1 text-xl font-bold">{profile?.nickname}</p>
            </div>
          </div>
          <p className="mt-3 text-sm font-semibold">
            {title.head} {title.accent && <span className="text-neon">{title.accent}</span>}
          </p>
          {/* bio 以纯文本渲染：首页不引入 lib/markdown（markdown-it+KaTeX+hljs 约 740kB 大包），
              完整 markdown 渲染留在关于页/文章页 */}
          <p className="mt-4 whitespace-pre-wrap text-xs leading-relaxed text-dim">
            {profile ? profile.bio : 'loading...'}
          </p>
          <p className="mt-5 flex items-center gap-2 font-mono text-sm text-neon">
            查看完整档案
            <ArrowRight
              size={15}
              weight="bold"
              className="transition-transform group-hover:translate-x-1"
            />
          </p>
        </Link>
      </div>
    </section>
  )
}
