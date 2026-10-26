import { useEffect, useState } from 'react'
import { DotsSixVertical, PencilSimple } from '@phosphor-icons/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { api, errMsg } from '../../../lib/api'
import type { ProjectDTO } from '../../../types/api'
import { TagPicker } from '../../components/TagPicker'
import { EmptyState, Field, Input, Textarea } from '../../components/ui'
import { SectionHeading } from '../../../components/SectionHeading'
import {
  AddButton,
  ConfirmDeleteButton,
  ErrBar,
  FormModal,
  RuneCount,
  SectionActions,
  SortableRow,
  TagSpans,
} from './parts'

// #03 项目（契约 #B7-#B10：模态框逐项提交，仅排序需要显式保存）
const projectSchema = z.object({
  name: z.string().trim().min(1, '项目名称必填').max(100, '不超过 100 字'),
  url: z.string().trim(),
  description: z.string().max(300, '不超过 300 字'),
  tags: z.array(z.string()),
})

type ProjectValues = z.infer<typeof projectSchema>

// 模态框内表单：每次打开都是新挂载，useForm 以传入行初始化
function ProjectModalForm({
  mode,
  row,
  pool,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  row: ProjectDTO | null
  pool: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [modalErr, setModalErr] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: row?.name ?? '',
      url: row?.url ?? '',
      description: row?.description ?? '',
      tags: row?.tags ?? [],
    },
  })
  const tags = watch('tags')

  const onSubmit = handleSubmit(async (values) => {
    setModalErr(null)
    try {
      const body = {
        name: values.name.trim(),
        url: values.url.trim(),
        description: values.description,
        tags: values.tags,
      }
      if (mode === 'edit' && row) await api.put(`/api/admin/about/projects/${row.id}`, body)
      else await api.post('/api/admin/about/projects', body, true)
      onSaved()
    } catch (e) {
      setModalErr(errMsg(e))
    }
  })

  return (
    <FormModal
      title={mode === 'create' ? '新增项目' : '编辑项目'}
      onClose={onClose}
      onSave={() => void onSubmit()}
      saveDisabled={isSubmitting || !watch('name').trim()}
    >
      {modalErr && <ErrBar text={modalErr} />}
      {errors.name && <ErrBar text={errors.name.message ?? ''} />}
      <Field label="项目名称">
        <Input autoFocus {...register('name')} maxLength={100} className="w-full" />
      </Field>
      <Field label="链接">
        <Input {...register('url')} className="w-full font-mono text-xs" />
      </Field>
      <Field label="描述">
        <Textarea
          {...register('description')}
          rows={3}
          maxLength={300}
          className="leading-relaxed"
        />
        <RuneCount value={watch('description')} max={300} />
      </Field>
      <Field label="标签">
        <TagPicker
          value={tags}
          onChange={(next) => setValue('tags', next, { shouldDirty: true })}
          pool={pool}
        />
      </Field>
    </FormModal>
  )
}

export function ProjectsSection({
  initial,
  onStats,
  onData,
}: {
  initial: ProjectDTO[]
  onStats: (sectionId: string, count: number, dirty: boolean) => void
  onData: (d: { kind: 'projects'; data: ProjectDTO[] }) => void
}) {
  const [projects, setProjects] = useState<ProjectDTO[]>(initial)
  const [projOrderDirty, setProjOrderDirty] = useState(false)
  const [projErr, setProjErr] = useState<string | null>(null)
  const [projModal, setProjModal] = useState<{
    mode: 'create' | 'edit'
    row: ProjectDTO | null
  } | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    onStats('about-projects', projects.length, projOrderDirty)
  }, [onStats, projects.length, projOrderDirty])

  useEffect(() => {
    onData({ kind: 'projects', data: projects })
  }, [onData, projects])

  const reloadProjects = async () => {
    const res = await api.get<{ projects: ProjectDTO[] }>('/api/about')
    setProjects(res.projects)
    setProjOrderDirty(false)
  }
  const removeProject = async (row: ProjectDTO) => {
    try {
      await api.del(`/api/admin/about/projects/${row.id}`)
      setProjects((ls) => ls.filter((x) => x.id !== row.id))
      setProjErr(null)
    } catch (e) {
      setProjErr(errMsg(e))
    }
  }
  const undoProjOrder = () => {
    setProjOrderDirty(false)
    void reloadProjects()
  }
  const saveProjSort = async (): Promise<boolean> => {
    try {
      await api.put('/api/admin/about/projects/sort', { ids: projects.map((p) => p.id) })
      await reloadProjects()
      setProjErr(null)
      return true
    } catch (e) {
      setProjErr(errMsg(e))
      return false
    }
  }

  // 标签候选：当前条目 tags 的并集（数据驱动，无全局标签库）
  const projPool = [...new Set(projects.flatMap((p) => p.tags))]

  return (
    <section id="about-projects" className="mt-14 scroll-mt-20">
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <SectionHeading
          num="#03"
          zh="项目"
          en="Projects"
          className="flex flex-1 flex-wrap items-center gap-4"
        />
        <SectionActions
          dirty={projOrderDirty}
          onUndo={undoProjOrder}
          onSave={saveProjSort}
          saveLabel="保存排序"
        />
      </div>
      {projErr && (
        <div className="mb-3">
          <ErrBar text={projErr} />
        </div>
      )}
      {projects.length === 0 ? (
        <EmptyState
          title="暂无项目"
          description="// C 端关于页即刻可见"
          action={{ label: '添加项目', onClick: () => setProjModal({ mode: 'create', row: null }) }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => {
              if (over && active.id !== over.id) {
                const oldIdx = projects.findIndex((p) => String(p.id) === active.id)
                const newIdx = projects.findIndex((p) => String(p.id) === over.id)
                if (oldIdx !== -1 && newIdx !== -1) {
                  setProjects(arrayMove(projects, oldIdx, newIdx))
                  setProjOrderDirty(true)
                }
              }
            }}
          >
            <SortableContext
              items={projects.map((p) => String(p.id))}
              strategy={verticalListSortingStrategy}
            >
              {projects.map((p) => (
                <SortableRow
                  key={p.id}
                  id={String(p.id)}
                  className="border border-edge bg-panel p-4"
                >
                  {({ attributes, listeners }) => (
                    <>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          title="拖拽排序"
                          {...attributes}
                          {...listeners}
                          className="cursor-grab touch-none text-faint active:cursor-grabbing"
                        >
                          <DotsSixVertical size={15} />
                        </span>
                        <span className="font-semibold">{p.name || '未命名项目'}</span>
                        {p.url && (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate font-mono text-[11px] text-faint transition-colors hover:text-neon"
                          >
                            {p.url}
                          </a>
                        )}
                        <div className="ml-auto flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={`编辑 ${p.name || '项目'}`}
                            onClick={() => setProjModal({ mode: 'edit', row: p })}
                            className="border border-edge p-1.5 text-faint transition-colors hover:border-neon/60 hover:text-neon"
                          >
                            <PencilSimple size={13} />
                          </button>
                          <ConfirmDeleteButton
                            name={p.name || '项目'}
                            onConfirm={() => void removeProject(p)}
                          />
                        </div>
                      </div>
                      <p className="mt-2.5 text-sm leading-relaxed text-dim">{p.description}</p>
                      <TagSpans className="mt-3" value={p.tags} />
                    </>
                  )}
                </SortableRow>
              ))}
            </SortableContext>
          </DndContext>
          <AddButton label="添加项目" onClick={() => setProjModal({ mode: 'create', row: null })} />
        </div>
      )}

      {projModal && (
        <ProjectModalForm
          key={projModal.mode === 'edit' ? `edit-${projModal.row?.id}` : 'create'}
          mode={projModal.mode}
          row={projModal.row}
          pool={projPool}
          onClose={() => setProjModal(null)}
          onSaved={() => {
            setProjModal(null)
            void reloadProjects()
          }}
        />
      )}
    </section>
  )
}
