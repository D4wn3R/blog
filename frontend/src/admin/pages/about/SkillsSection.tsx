import { useEffect, useState } from 'react'
import { DotsSixVertical } from '@phosphor-icons/react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { api, errMsg } from '../../../lib/api'
import type { SkillDTO } from '../../../types/api'
import { TagPicker } from '../../components/TagPicker'
import { EmptyState, Input } from '../../components/ui'
import { SectionHeading } from '../../../components/SectionHeading'
import { AddButton, ConfirmDeleteButton, ErrBar, SectionActions, SortableRow } from './parts'

// #02 技能栈（契约 #B3-#B6：行内编辑 + 批量排序；保存全部修改 = 新增行 POST + 变更行 PUT + 顺序变化 PUT sort）
// 熟练度 = 滑杆 + 数值联动，拖动即所见（右侧预览同步）
export function SkillsSection({
  initial,
  onStats,
  onData,
}: {
  initial: SkillDTO[]
  onStats: (sectionId: string, count: number, dirty: boolean) => void
  onData: (d: { kind: 'skills'; data: SkillDTO[] }) => void
}) {
  const [skills, setSkills] = useState<SkillDTO[]>(initial)
  const [skillsSaved, setSkillsSaved] = useState<SkillDTO[]>(initial)
  const [skillErrIds, setSkillErrIds] = useState<number[]>([])
  const [skillsErr, setSkillsErr] = useState<string | null>(null)
  const skillDirty = JSON.stringify(skills) !== JSON.stringify(skillsSaved)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    onStats('about-skills', skills.length, skillDirty)
  }, [onStats, skills.length, skillDirty])

  useEffect(() => {
    onData({ kind: 'skills', data: skills })
  }, [onData, skills])

  const updateSkill = (id: number, patch: Partial<SkillDTO>) =>
    setSkills((ls) => ls.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const addSkill = () =>
    setSkills((ls) => [...ls, { id: Date.now(), name: '', percent: 50, items: [] }])
  const removeSkill = async (row: SkillDTO) => {
    try {
      // 未落库的新增行直接本地移除
      if (skillsSaved.some((s) => s.id === row.id)) {
        await api.del(`/api/admin/about/skills/${row.id}`)
        setSkillsSaved((ls) => ls.filter((s) => s.id !== row.id))
      }
      setSkills((ls) => ls.filter((s) => s.id !== row.id))
      setSkillsErr(null)
    } catch (e) {
      setSkillsErr(errMsg(e))
    }
  }
  const saveSkills = async (): Promise<boolean> => {
    const bad = skills.filter((s) => !s.name.trim()).map((s) => s.id)
    if (bad.length > 0) {
      setSkillErrIds(bad)
      return false
    }
    setSkillErrIds([])
    const savedById = new Map(skillsSaved.map((s) => [s.id, s]))
    const next = [...skills]
    try {
      for (let i = 0; i < next.length; i++) {
        const row = next[i]
        const body = {
          name: row.name.trim(),
          percent: Math.min(100, Math.max(0, Math.round(row.percent))),
          items: row.items,
        }
        if (!savedById.has(row.id)) {
          next[i] = await api.post<SkillDTO>('/api/admin/about/skills', body, true)
        } else if (JSON.stringify(row) !== JSON.stringify(savedById.get(row.id))) {
          next[i] = await api.put<SkillDTO>(`/api/admin/about/skills/${row.id}`, body)
        }
      }
      if (next.map((s) => s.id).join(',') !== skillsSaved.map((s) => s.id).join(',')) {
        await api.put('/api/admin/about/skills/sort', { ids: next.map((s) => s.id) })
      }
    } catch (e) {
      setSkillsErr(errMsg(e))
      setSkills(next)
      return false
    }
    setSkills(next)
    setSkillsSaved(next)
    setSkillsErr(null)
    return true
  }
  const undoSkills = () => {
    setSkills(skillsSaved)
    setSkillErrIds([])
    setSkillsErr(null)
  }

  // 标签候选：当前条目 items 的并集（数据驱动，无全局标签库）
  const skillPool = [...new Set(skills.flatMap((s) => s.items))]

  return (
    <section id="about-skills" className="mt-14 scroll-mt-20">
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <SectionHeading
          num="#02"
          zh="技能栈"
          en="Tech Stack"
          className="flex flex-1 flex-wrap items-center gap-4"
        />
        {skillErrIds.length > 0 && (
          <p className="font-mono text-[11px] text-pulse">技能名称不能为空，保存被拦截</p>
        )}
        <SectionActions
          dirty={skillDirty}
          onUndo={undoSkills}
          onSave={saveSkills}
          saveLabel="保存全部修改"
        />
      </div>
      {skillsErr && (
        <div className="mb-3">
          <ErrBar text={skillsErr} />
        </div>
      )}
      {skills.length === 0 ? (
        <EmptyState
          title="暂无技能条目"
          description="// 添加后可拖拽排序"
          action={{ label: '添加技能', onClick: addSkill }}
        />
      ) : (
        <>
          <div className="hidden grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1.2fr)_auto] gap-3 px-3 pb-1 font-mono text-[11px] tracking-widest text-faint sm:grid">
            <span />
            <span>技能名称</span>
            <span>熟练度</span>
            <span>标签</span>
            <span className="text-right">操作</span>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => {
              if (over && active.id !== over.id) {
                const oldIdx = skills.findIndex((s) => String(s.id) === active.id)
                const newIdx = skills.findIndex((s) => String(s.id) === over.id)
                if (oldIdx !== -1 && newIdx !== -1) setSkills(arrayMove(skills, oldIdx, newIdx))
              }
            }}
          >
            <SortableContext
              items={skills.map((s) => String(s.id))}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {skills.map((skill) => (
                  <SortableRow
                    key={skill.id}
                    id={String(skill.id)}
                    className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border bg-panel p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1.2fr)_auto] ${
                      skillErrIds.includes(skill.id) ? 'border-pulse/60' : 'border-edge'
                    }`}
                  >
                    {({ attributes, listeners }) => (
                      <>
                        <span
                          aria-hidden="true"
                          title="拖拽排序"
                          {...attributes}
                          {...listeners}
                          className="cursor-grab touch-none self-center text-faint active:cursor-grabbing"
                        >
                          <DotsSixVertical size={15} />
                        </span>
                        <Input
                          value={skill.name}
                          aria-label="技能名称"
                          maxLength={50}
                          onChange={(e) => updateSkill(skill.id, { name: e.target.value })}
                          className="min-w-0"
                        />
                        <div className="flex items-center justify-end sm:col-start-5 sm:row-start-1">
                          <ConfirmDeleteButton
                            name={skill.name || '技能'}
                            onConfirm={() => void removeSkill(skill)}
                          />
                        </div>
                        <div className="col-span-3 flex items-center gap-2.5 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={skill.percent}
                            aria-label="熟练度百分比"
                            onChange={(e) =>
                              updateSkill(skill.id, { percent: Number(e.target.value) })
                            }
                            className="h-1 w-28 shrink-0 cursor-pointer appearance-none rounded-full bg-edge accent-neon"
                            style={{ accentColor: 'var(--color-neon)' }}
                          />
                          <input
                            value={skill.percent}
                            inputMode="numeric"
                            aria-label="熟练度数值"
                            onChange={(e) =>
                              updateSkill(skill.id, {
                                percent: Math.min(
                                  100,
                                  Number(e.target.value.replace(/\D/g, '') || 0),
                                ),
                              })
                            }
                            className="w-14 px-1 text-center font-mono"
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-1 sm:col-start-4 sm:row-start-1">
                          <TagPicker
                            collapsible
                            value={skill.items}
                            onChange={(items) => updateSkill(skill.id, { items })}
                            pool={skillPool}
                          />
                        </div>
                      </>
                    )}
                  </SortableRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div className="mt-2">
            <AddButton label="添加技能" onClick={addSkill} />
          </div>
        </>
      )}
    </section>
  )
}
