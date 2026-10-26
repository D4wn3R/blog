import { useCallback, useEffect, useState } from 'react'
import { ArrowSquareOut, EyeSlash } from '@phosphor-icons/react'
import { errMsg } from '../../lib/api'
import { useAbout } from '../../lib/queries'
import { ContactsSection } from './about/ContactsSection'
import { JourneysSection } from './about/JourneysSection'
import { ProfileSection } from './about/ProfileSection'
import { ProjectsSection } from './about/ProjectsSection'
import { SkillsSection } from './about/SkillsSection'
import { PreviewPane, type PreviewData } from './about/PreviewPane'
import { ErrBar } from './about/parts'
import type { ContactDTO, JourneyDTO, ProfileDTO, ProjectDTO, SkillDTO } from '../../types/api'

// 关于页内容管理：#B1 聚合读取，五分区各自走 #B2-#B17 写接口；
// 双栏（方案 A 预览驱动）：左编辑列（分区表单），右 sticky 预览列渲染 C 端同款组件——
// 分区把「计数/脏标记 + 草稿数据」实时上报壳层（onStats/onData），壳层汇总喂 PreviewPane

const SECTIONS = [
  { id: 'about-identity', num: '#01', zh: '资料卡', en: 'Identity' },
  { id: 'about-skills', num: '#02', zh: '技能栈', en: 'Tech Stack' },
  { id: 'about-projects', num: '#03', zh: '项目', en: 'Projects' },
  { id: 'about-journey', num: '#04', zh: '足迹', en: 'Journey' },
  { id: 'about-contacts', num: '#05', zh: '联系方式', en: 'Contact' },
] as const

interface SectionStats {
  count: number
  dirty: boolean
}

// 分区上报的草稿数据（部分字段缺省 = 该分区数据未变，沿用上次值）
type Draft =
  | { kind: 'profile'; data: ProfileDTO }
  | { kind: 'skills'; data: SkillDTO[] }
  | { kind: 'projects'; data: ProjectDTO[] }
  | { kind: 'journey'; data: JourneyDTO[] }
  | { kind: 'contacts'; data: ContactDTO[] }

export function AdminAbout() {
  const about = useAbout()
  const [loadTick, setLoadTick] = useState(0)
  const [stats, setStats] = useState<Record<string, SectionStats>>({})
  const [previewOn, setPreviewOn] = useState(true)
  // 预览草稿：分区 onData 上报的实时值（初始 = 服务端聚合，编辑过程逐步覆盖）
  const [draft, setDraft] = useState<{
    profile?: ProfileDTO
    skills?: SkillDTO[]
    projects?: ProjectDTO[]
    journey?: JourneyDTO[]
    contacts?: ContactDTO[]
  }>({})

  const onStats = useCallback((sectionId: string, count: number, dirty: boolean) => {
    setStats((prev) => ({ ...prev, [sectionId]: { count, dirty } }))
  }, [])

  const onData = useCallback((d: Draft) => {
    setDraft((prev) => ({ ...prev, [d.kind]: d.data }))
  }, [])

  const loading = about.isPending
  const initial = about.data ?? null

  // 重试：refetch 成功后递增 loadTick 重挂载各分区（等价整体重置，草稿也随之清空）
  const refetch = about.refetch
  const loadAll = useCallback(() => {
    void refetch().then((r) => {
      if (r.isSuccess) {
        setLoadTick((t) => t + 1)
        setDraft({})
      }
    })
  }, [refetch])

  // —— 未保存离开守卫：脏时拦 关页/刷新（beforeunload）；页面内本无跳转入口，
  //    预览列脏分区 neon 描边 + 各分区撤销按钮兜底误操作 ——
  const anyDirty = Object.values(stats).some((s) => s.dirty)
  useEffect(() => {
    if (!anyDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [anyDirty])

  if (loading) {
    return (
      <div className="p-8">
        <p className="font-mono text-xs text-faint">加载中…</p>
      </div>
    )
  }

  if (about.isError) {
    return (
      <div className="p-8">
        <div className="max-w-md">
          <ErrBar text={errMsg(about.error)} />
        </div>
        <button
          type="button"
          onClick={loadAll}
          className="mt-4 border border-neon/50 px-3.5 py-1.5 font-mono text-xs text-neon transition-colors hover:bg-neon hover:text-void"
        >
          重试
        </button>
      </div>
    )
  }
  if (!initial) return null

  // 预览数据 = 服务端聚合 + 分区草稿覆盖
  const previewData: PreviewData = {
    profile: draft.profile ?? initial.profile,
    settings: initial.settings,
    skills: draft.skills ?? initial.skills,
    projects: draft.projects ?? initial.projects,
    journey: draft.journey ?? initial.journey,
    contacts: draft.contacts ?? initial.contacts,
  }
  const dirtyMap: Record<string, boolean> = {}
  for (const s of SECTIONS) dirtyMap[s.id] = stats[s.id]?.dirty ?? false

  return (
    <div className="flex max-w-[100rem] gap-8 p-6 xl:gap-10 xl:p-8">
      {/* 编辑列 */}
      <div className="min-w-0 w-1/2">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">关于页内容</h1>
            <p className="mt-1.5 font-mono text-[11px] text-faint">
              // 左侧编辑 · 右侧实时预览 C 端效果 · 亮 neon 边的分区有未保存修改
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setPreviewOn((v) => !v)}
              className="flex items-center gap-1.5 border border-edge px-3.5 py-1.5 font-mono text-xs text-dim transition-colors hover:border-neon/50 hover:text-neon xl:hidden"
            >
              <EyeSlash size={13} />
              {previewOn ? '收起预览' : '展开预览'}
            </button>
            <a
              href="/about"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 border border-edge px-3.5 py-1.5 font-mono text-xs text-dim transition-colors hover:border-neon/50 hover:text-neon"
            >
              打开 C 端页面
              <ArrowSquareOut size={13} />
            </a>
          </div>
        </div>

        <ProfileSection
          key={`identity-${loadTick}`}
          initial={initial.profile}
          onStats={onStats}
          onData={onData}
        />
        <SkillsSection
          key={`skills-${loadTick}`}
          initial={initial.skills}
          onStats={onStats}
          onData={onData}
        />
        <ProjectsSection
          key={`projects-${loadTick}`}
          initial={initial.projects}
          onStats={onStats}
          onData={onData}
        />
        <JourneysSection
          key={`journey-${loadTick}`}
          initial={initial.journey}
          onStats={onStats}
          onData={onData}
        />
        <ContactsSection
          key={`contacts-${loadTick}`}
          initial={initial.contacts}
          onStats={onStats}
          onData={onData}
        />
      </div>

      {/* 右预览列：sticky 终端窗口，随编辑实时更新；与编辑列五五开 */}
      {previewOn && (
        <aside className="sticky top-6 hidden h-[calc(100dvh-3rem)] w-1/2 self-start xl:block">
          <PreviewPane data={previewData} dirtyMap={dirtyMap} />
        </aside>
      )}
    </div>
  )
}
