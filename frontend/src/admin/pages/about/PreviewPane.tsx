import { renderMarkdown } from '../../../lib/markdown'
import { AboutHero, SKILL_ICONS } from '../../../pages/about/AboutHero'
import { SkillCard } from '../../../pages/about/SkillCard'
import { ContactCard, JourneyNode, ProjectCard } from '../../../pages/about/about-cards'
import type {
  ContactDTO,
  JourneyDTO,
  ProfileDTO,
  ProjectDTO,
  SettingsDTO,
  SkillDTO,
} from '../../../types/api'

// 实时预览列：终端窗口隐喻（mono 标题栏 + 三圆点 + 独立滚动），
// 数据直接喂 C 端同款组件——编辑即所见；脏分区 neon 描边 + 分区编号锚点

export interface PreviewData {
  profile: ProfileDTO
  settings: SettingsDTO
  skills: SkillDTO[]
  projects: ProjectDTO[]
  journey: JourneyDTO[]
  contacts: ContactDTO[]
}

// 分区壳：编号标题 + 脏时 neon 左边线（预览里直观标出「此段未保存」）
function PreviewSection({
  id,
  num,
  en,
  dirty,
  children,
}: {
  id: string
  num: string
  en: string
  dirty: boolean
  children: React.ReactNode
}) {
  return (
    <section
      id={`preview-${id}`}
      className={`border-l-2 py-10 pl-5 transition-colors ${
        dirty ? 'border-neon' : 'border-transparent'
      }`}
    >
      <div className="mb-5">
        <p className="font-mono text-sm text-faint">{num}</p>
        <h3 className="mt-1 text-xl font-bold tracking-tight">{en}</h3>
        {dirty && (
          <p className="mt-1 font-mono text-[10px] text-neon">// previewing unsaved changes</p>
        )}
      </div>
      {children}
    </section>
  )
}

function EmptyLine({ text }: { text: string }) {
  return <p className="font-mono text-xs text-faint">// {text}</p>
}

export function PreviewPane({
  data,
  dirtyMap,
}: {
  data: PreviewData
  dirtyMap: Record<string, boolean>
}) {
  const { profile, settings, skills, projects, journey, contacts } = data

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_0_24px_rgba(46,230,255,0.06)]">
      {/* 终端标题栏：三圆点 + 路径提示 */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-edge bg-panel-2/60 px-4">
        <span aria-hidden="true" className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-pulse/60" />
          <span className="h-2.5 w-2.5 rounded-full border border-volt/60" />
          <span className="h-2.5 w-2.5 rounded-full border border-neon/60" />
        </span>
        <span className="ml-2 font-mono text-xs text-faint">~/preview/about</span>
        <span className="ml-auto font-mono text-[10px] text-faint">
          LIVE · 未保存段落亮 neon 边
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="scale-[0.92] origin-top-left w-[108.7%]">
          {/* Hero 缩放复刻：标签弹入动画只在挂载时跑一次，数据变化不重放 */}
          <AboutHero profile={profile} settings={settings} />

          <div className="px-6 pb-10">
            <PreviewSection
              id="about-identity"
              num="#01"
              en="Identity"
              dirty={!!dirtyMap['about-identity']}
            >
              {profile.bio ? (
                <div
                  className="about-prose about-prose--compact max-w-[40em] text-dim"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(profile.bio) }}
                />
              ) : (
                <EmptyLine text="bio is empty" />
              )}
            </PreviewSection>

            <PreviewSection
              id="about-skills"
              num="#02"
              en="Tech Stack"
              dirty={!!dirtyMap['about-skills']}
            >
              {skills.length === 0 ? (
                <EmptyLine text="no skills yet" />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {skills.map((skill, i) => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      icon={SKILL_ICONS[i % SKILL_ICONS.length]}
                    />
                  ))}
                </div>
              )}
            </PreviewSection>

            <PreviewSection
              id="about-projects"
              num="#03"
              en="Projects"
              dirty={!!dirtyMap['about-projects']}
            >
              {projects.length === 0 ? (
                <EmptyLine text="no projects yet" />
              ) : (
                <div className="flex flex-col gap-4">
                  {projects.map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
              )}
            </PreviewSection>

            <PreviewSection
              id="about-journey"
              num="#04"
              en="Journey"
              dirty={!!dirtyMap['about-journey']}
            >
              {journey.length === 0 ? (
                <EmptyLine text="no journey yet" />
              ) : (
                <div className="flex flex-col">
                  {journey.map((node, i) => (
                    <JourneyNode key={node.id} node={node} isLast={i === journey.length - 1} />
                  ))}
                </div>
              )}
            </PreviewSection>

            <PreviewSection
              id="about-contacts"
              num="#05"
              en="Contact"
              dirty={!!dirtyMap['about-contacts']}
            >
              {contacts.length === 0 ? (
                <EmptyLine text="no contacts yet" />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {contacts.map((c) => (
                    <ContactCard key={c.id} contact={c} />
                  ))}
                </div>
              )}
            </PreviewSection>

            <p className="py-10 text-center font-mono text-xs text-faint">{'// EOF'} —— preview</p>
          </div>
        </div>
      </div>
    </div>
  )
}
