import { errMsg } from '../lib/api'
import { renderMarkdown } from '../lib/markdown'
import { useAbout } from '../lib/queries'
import { Reveal } from '../components/Reveal'
import { AboutHero, SectionTitle, SKILL_ICONS } from './about/AboutHero'
import { SkillCard } from './about/SkillCard'
import { ContactCard, JourneyNode, ProjectCard } from './about/about-cards'

// 关于页：五段式（Identity / Tech Stack / Projects / Journey / Contact）
export function AboutPage() {
  const about = useAbout()

  if (about.isPending) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono text-sm text-faint">loading...</p>
      </div>
    )
  }

  if (about.isError || !about.data) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono text-sm text-pulse">
          {about.isError ? `error: ${errMsg(about.error)}` : 'no profile yet'}
        </p>
      </div>
    )
  }
  const aboutData = about.data

  return (
    <>
      <AboutHero profile={aboutData.profile} settings={aboutData.settings} />

      <div className="mx-auto w-full max-w-6xl px-6 pb-10">
        <section className="py-16">
          <Reveal>
            <SectionTitle num="#01" en="Identity" />
          </Reveal>
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
            <Reveal>
              <div>
                {/* Hero 与 Identity 合并后的自我介绍：一段 markdown（B 端资料卡编辑） */}
                {aboutData.profile.bio ? (
                  <div
                    className="about-prose max-w-[40em] text-dim"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(aboutData.profile.bio) }}
                  />
                ) : (
                  <p className="font-mono text-xs text-faint">// bio is empty</p>
                )}
              </div>
            </Reveal>
          </div>
        </section>

        <section className="py-16">
          <Reveal>
            <SectionTitle num="#02" en="Tech Stack" />
          </Reveal>
          {aboutData.skills.length === 0 ? (
            <p className="font-mono text-xs text-faint">// no skills yet</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {aboutData.skills.map((skill, i) => (
                <Reveal key={skill.id} delay={i * 0.06}>
                  <SkillCard skill={skill} icon={SKILL_ICONS[i % SKILL_ICONS.length]} />
                </Reveal>
              ))}
            </div>
          )}
        </section>

        {/* #03 Projects（契约 Project DTO 无 url 字段，不渲染链接行） */}
        <section className="py-16">
          <Reveal>
            <SectionTitle num="#03" en="Projects" />
          </Reveal>
          {aboutData.projects.length === 0 ? (
            <p className="font-mono text-xs text-faint">// no projects yet</p>
          ) : (
            <div className="flex flex-col gap-4">
              {aboutData.projects.map((project) => (
                <Reveal key={project.id}>
                  <ProjectCard project={project} />
                </Reveal>
              ))}
            </div>
          )}
        </section>

        <section className="py-16">
          <Reveal>
            <SectionTitle num="#04" en="Journey" />
          </Reveal>
          {aboutData.journey.length === 0 ? (
            <p className="font-mono text-xs text-faint">// no journey yet</p>
          ) : (
            <div className="flex flex-col">
              {aboutData.journey.map((node, i) => (
                <Reveal key={node.id} delay={i * 0.05}>
                  <JourneyNode node={node} isLast={i === aboutData.journey.length - 1} />
                </Reveal>
              ))}
            </div>
          )}
        </section>

        <section className="py-16">
          <Reveal>
            <SectionTitle num="#05" en="Contact" />
          </Reveal>
          {aboutData.contacts.length === 0 ? (
            <p className="font-mono text-xs text-faint">// no contacts yet</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {aboutData.contacts.map((contact, i) => (
                <Reveal key={contact.id} delay={i * 0.05}>
                  <ContactCard contact={contact} />
                </Reveal>
              ))}
            </div>
          )}
          <Reveal delay={0.1}>
            <p className="mt-6 border border-neon/30 bg-neon/5 px-5 py-3.5 font-mono text-xs text-dim">
              <span className="text-neon">●</span> current status
              <span className="mx-3 text-faint">·</span>
              欢迎一起交流、学习
            </p>
          </Reveal>
        </section>

        <section className="py-20 text-center">
          <Reveal>
            <p className="font-mono text-xs text-faint">
              {'// EOF'} —— D4wn3R © 2026 with Go &amp; React
            </p>
          </Reveal>
        </section>
      </div>
    </>
  )
}
