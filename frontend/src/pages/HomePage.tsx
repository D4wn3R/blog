import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router'
import { ArrowRight } from '@phosphor-icons/react'
import { animate } from 'animejs'
import { useReducedMotion } from 'motion/react'
import { Hero } from '../components/Hero'
import { PostList } from '../components/PostList'
import { Reveal } from '../components/Reveal'
import { SectionHeader } from '../components/SectionHeader'
import { LoadingLine, EmptyLine, ErrorLine } from '../components/States'
import { errMsg } from '../lib/api'
import { useArchiveIndex, useFriendLinks, useLatestPosts, useMomentsTotal } from '../lib/queries'

// 门户计数滚动：异步计数到达时从当前值滚动到目标值（anime.js 经典数值补间）
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef(0)
  const reduce = useReducedMotion()
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce) {
      el.textContent = String(value)
      return
    }
    const state = { v: shown.current }
    const anim = animate(state, {
      v: value,
      duration: 850,
      ease: 'outExpo',
      onUpdate: () => {
        el.textContent = String(Math.round(state.v))
      },
    })
    shown.current = value
    return () => {
      anim.revert()
    }
  }, [value, reduce])
  return <span ref={ref}>0</span>
}

// 首页 = 全站门户：终端目录式模块入口，逐行列出可进入的页面（计数来自真实接口）
function buildPortals(meta: { posts: number; moments: number; years: number; links: number }) {
  return [
    {
      index: '01',
      to: '/posts',
      title: '文章',
      path: '~/posts',
      desc: '水文',
      count: meta.posts,
      unit: 'posts',
    },
    {
      index: '02',
      to: '/moments',
      title: '动态',
      path: '~/moments',
      desc: '碎碎念',
      count: meta.moments,
      unit: 'moments',
    },
    {
      index: '03',
      to: '/archive',
      title: '归档',
      path: '~/archive',
      desc: '记录足迹',
      count: meta.years,
      unit: 'years',
    },
    {
      index: '04',
      to: '/links',
      title: '友链',
      path: '~/links',
      desc: 'friends',
      count: meta.links,
      unit: 'links',
    },
    {
      index: '05',
      to: '/about',
      title: '关于',
      path: '~/about',
      desc: 'about me',
      count: null as number | null,
      unit: 'profile',
    },
  ]
}

export function HomePage() {
  const latest = useLatestPosts()
  const momentsTotal = useMomentsTotal()
  const archive = useArchiveIndex()
  const links = useFriendLinks()

  const posts = latest.data?.list ?? []
  // 计数查询失败时保持 0，不阻塞页面
  const meta = {
    posts: latest.data?.total ?? 0,
    moments: momentsTotal.data ?? 0,
    years: new Set(archive.data?.map((a) => a.year) ?? []).size,
    links: links.data?.length ?? 0,
  }

  return (
    <>
      <Hero />

      <section className="pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <SectionHeader title="最新文章" path="~/posts" />
          </Reveal>

          {latest.isPending ? (
            <LoadingLine />
          ) : latest.isError ? (
            <ErrorLine message={errMsg(latest.error)} onRetry={() => void latest.refetch()} />
          ) : posts.length === 0 ? (
            <EmptyLine text="no posts yet" />
          ) : (
            <PostList posts={posts} />
          )}
        </div>
      </section>

      <section className="pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <SectionHeader title="进入模块" path="~/directory" />
          </Reveal>

          <div className="flex flex-col gap-3">
            {buildPortals(meta).map((p, i) => (
              <Reveal key={p.to} delay={0.06 * i}>
                <Link
                  to={p.to}
                  className="group grid grid-cols-[2.75rem_1fr] items-center gap-x-5 border border-edge bg-panel px-5 py-5 transition-colors duration-300 hover:border-neon/50 hover:bg-neon/5 md:grid-cols-[4.5rem_9rem_1fr_auto_1.5rem]"
                >
                  <span className="font-mono text-2xl text-edge transition-colors group-hover:text-neon">
                    {p.index}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-lg font-semibold leading-snug transition-colors group-hover:text-neon">
                      {p.title}
                    </span>
                    <span className="font-mono text-xs text-faint">{p.path}</span>
                  </span>
                  <span className="hidden text-center text-sm text-dim md:block">{p.desc}</span>
                  <span className="hidden border border-edge px-2.5 py-0.5 font-mono text-xs text-faint transition-colors group-hover:border-neon/40 sm:block">
                    {p.count === null ? (
                      p.unit
                    ) : (
                      <>
                        <CountUp value={p.count} /> {p.unit}
                      </>
                    )}
                  </span>
                  <ArrowRight
                    size={18}
                    aria-hidden="true"
                    className="hidden text-faint transition-all group-hover:translate-x-1 group-hover:text-neon md:block"
                  />
                </Link>
              </Reveal>
            ))}
          </div>

          <p className="mt-10 font-mono text-sm text-faint">
            $ select a module to enter
            <span className="cursor-blink ml-1" aria-hidden="true">
              ▊
            </span>
          </p>
        </div>
      </section>
    </>
  )
}
