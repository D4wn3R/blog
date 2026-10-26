import { ArrowRight, ArrowSquareOut } from '@phosphor-icons/react'
import { fmtYearMonth } from '../../lib/api'
import { getContactIcon, type ContactIcon } from '../../components/ContactIcons'
import type { ContactDTO, JourneyDTO, ProjectDTO } from '../../types/api'

// 关于页展示卡（C 端 AboutPage 与 B 端实时预览共用）：
// 拆出后 C 端行为零变化（Reveal 入场仍由页面层包裹），B 端预览得以渲染同款组件保证所见即所得

export function ProjectCard({ project }: { project: ProjectDTO }) {
  return (
    <div className="border border-edge bg-panel p-6 transition-colors duration-300 hover:border-neon/40 md:p-8">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold">{project.name}</h3>
        {project.url && (
          <a
            href={project.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 border border-neon/50 bg-neon/10 px-2.5 py-0.5 font-mono text-xs text-neon transition-colors hover:bg-neon hover:text-void"
          >
            访问
            <ArrowSquareOut size={13} />
          </a>
        )}
      </div>
      <p className="max-w-[46em] whitespace-pre-wrap break-words text-sm leading-relaxed text-dim">
        {project.description}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {project.tags.map((tag) => (
          <span key={tag} className="border border-edge px-2.5 py-0.5 font-mono text-xs text-dim">
            {tag}
          </span>
        ))}
      </div>
    </div>
  )
}

export function JourneyNode({ node, isLast }: { node: JourneyDTO; isLast: boolean }) {
  return (
    <div className="flex gap-6 md:gap-8">
      <div className="relative flex w-4 shrink-0 justify-center">
        <div
          className={`absolute top-3 bottom-0 border-l border-dashed border-edge ${
            isLast ? 'hidden' : ''
          }`}
        />
        <span className="relative mt-2.5 h-2 w-2 shrink-0 rounded-full bg-neon" />
      </div>
      <div className="pb-10">
        <p className="font-mono text-xs text-faint">{fmtYearMonth(node.time)}</p>
        <h3 className="mt-1.5 font-semibold transition-colors hover:text-neon">{node.title}</h3>
        <p className="mt-2 max-w-[40em] whitespace-pre-wrap break-words text-sm leading-relaxed text-dim">
          {node.description}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {node.tags.map((tag) => (
            <span
              key={tag}
              className="border border-edge px-2 py-0.5 font-mono text-[11px] text-faint"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// icon 由父层解析后传入（SkillCard 同款惯例）：避免在渲染期解析组件触发 lint 告警
export function ContactCard({ contact }: { contact: ContactDTO }) {
  return <ContactCardInner contact={contact} Icon={getContactIcon(contact.icon)} />
}

function ContactCardInner({ contact, Icon }: { contact: ContactDTO; Icon: ContactIcon }) {
  return (
    <a
      href={contact.value}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-4 border border-edge bg-panel p-5 transition-colors duration-300 hover:border-neon/50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-edge text-dim transition-colors group-hover:border-neon/50 group-hover:text-neon">
        <Icon size={18} />
      </span>
      {/* value 参与跳转但不外显，卡片只展示渠道名 */}
      <span className="min-w-0">
        <span className="block font-mono text-[10px] tracking-widest text-faint">
          {contact.label}
        </span>
        <span className="mt-0.5 block truncate text-sm text-ink">
          欢迎通过 {contact.label} 联系我
        </span>
      </span>
      <ArrowRight
        size={16}
        className="ml-auto shrink-0 text-faint transition-all group-hover:translate-x-1 group-hover:text-neon"
      />
    </a>
  )
}
