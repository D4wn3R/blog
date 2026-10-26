import { motion, useReducedMotion } from 'motion/react'
import type { SkillDTO } from '../../types/api'
import { SKILL_ICONS } from './AboutHero'

export function SkillCard({
  skill,
  icon: Icon,
}: {
  skill: SkillDTO
  icon: (typeof SKILL_ICONS)[number]
}) {
  const reduce = useReducedMotion()
  return (
    <div className="border border-edge bg-panel p-6 transition-colors duration-300 hover:border-neon/40">
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2.5 font-medium">
          <Icon size={17} className="text-neon" />
          {skill.name}
        </span>
        <span className="font-mono text-sm text-neon">{skill.percent}%</span>
      </div>
      <div className="h-0.5 w-full bg-edge">
        <motion.div
          className="h-full origin-left bg-neon shadow-[0_0_8px_rgba(46,230,255,0.6)]"
          initial={reduce ? { scaleX: skill.percent / 100 } : { scaleX: 0 }}
          whileInView={{ scaleX: skill.percent / 100 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <p className="mt-4 font-mono text-xs text-faint">{skill.items.join(' · ')}</p>
    </div>
  )
}
