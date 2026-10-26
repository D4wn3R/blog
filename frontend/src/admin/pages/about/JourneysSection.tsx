import { useEffect, useState } from 'react'
import { PencilSimple } from '@phosphor-icons/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { api, errMsg } from '../../../lib/api'
import type { JourneyDTO } from '../../../types/api'
import { TagPicker } from '../../components/TagPicker'
import { DateField, EmptyState, Field, Input, Textarea } from '../../components/ui'
import { SectionHeading } from '../../../components/SectionHeading'
import { AddButton, ConfirmDeleteButton, ErrBar, FormModal, RuneCount, TagSpans } from './parts'

// #04 足迹（契约 #B11-#B13：路径为单数 journey，time 为 YYYY-M-D 日期，后端 DATE 列；列表按时间降序）
const journeySchema = z.object({
  time: z
    .string()
    .trim()
    .min(1, '时间必填')
    .regex(/^\d{4}-\d{1,2}-\d{1,2}$/, '时间格式应为 2026-4-16')
    .refine((v) => {
      const [y, m, d] = v.split('-').map(Number)
      const t = new Date(y, m - 1, d)
      return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d
    }, '日期不存在'),
  title: z.string().trim().min(1, '节点标题必填').max(50, '不超过 50 字'),
  description: z.string().max(200, '不超过 200 字'),
  tags: z.array(z.string()),
})

type JourneyValues = z.infer<typeof journeySchema>

// 模态框内表单：每次打开都是新挂载，useForm 以传入行初始化
function JourneyModalForm({
  mode,
  row,
  pool,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  row: JourneyDTO | null
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
    control,
    formState: { isSubmitting, errors },
  } = useForm<JourneyValues>({
    resolver: zodResolver(journeySchema),
    defaultValues: {
      time: row?.time ?? '',
      title: row?.title ?? '',
      description: row?.description ?? '',
      tags: row?.tags ?? [],
    },
  })
  const tags = watch('tags')

  const onSubmit = handleSubmit(async (values) => {
    setModalErr(null)
    try {
      const body = {
        time: values.time.trim(),
        title: values.title.trim(),
        description: values.description,
        tags: values.tags,
      }
      if (mode === 'edit' && row) await api.put(`/api/admin/about/journey/${row.id}`, body)
      else await api.post('/api/admin/about/journey', body, true)
      onSaved()
    } catch (e) {
      setModalErr(errMsg(e))
    }
  })

  return (
    <FormModal
      title={mode === 'create' ? '新增足迹节点' : '编辑足迹节点'}
      onClose={onClose}
      onSave={() => void onSubmit()}
      saveDisabled={isSubmitting || !watch('time').trim() || !watch('title').trim()}
    >
      {modalErr && <ErrBar text={modalErr} />}
      {(errors.time || errors.title) && (
        <ErrBar text={errors.time?.message ?? errors.title?.message ?? ''} />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Field label="时间">
          <Controller
            name="time"
            control={control}
            render={({ field }) => (
              <DateField autoFocus {...field} error={!!errors.time} className="text-xs" />
            )}
          />
        </Field>
        <Field label="节点标题">
          <Input {...register('title')} maxLength={50} className="w-full" />
        </Field>
      </div>
      <Field label="描述">
        <Textarea
          {...register('description')}
          rows={3}
          maxLength={200}
          className="leading-relaxed"
        />
        <RuneCount value={watch('description')} max={200} />
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

export function JourneysSection({
  initial,
  onStats,
  onData,
}: {
  initial: JourneyDTO[]
  onStats: (sectionId: string, count: number, dirty: boolean) => void
  onData: (d: { kind: 'journey'; data: JourneyDTO[] }) => void
}) {
  const [journey, setJourney] = useState<JourneyDTO[]>(initial)
  const [journeyErr, setJourneyErr] = useState<string | null>(null)
  const [journeyModal, setJourneyModal] = useState<{
    mode: 'create' | 'edit'
    row: JourneyDTO | null
  } | null>(null)
  useEffect(() => {
    onStats('about-journey', journey.length, false)
  }, [onStats, journey.length])

  useEffect(() => {
    onData({ kind: 'journey', data: journey })
  }, [onData, journey])

  const reloadJourney = async () => {
    const res = await api.get<{ journey: JourneyDTO[] }>('/api/about')
    setJourney(res.journey)
  }
  const removeJourney = async (row: JourneyDTO) => {
    try {
      await api.del(`/api/admin/about/journey/${row.id}`)
      setJourney((ls) => ls.filter((x) => x.id !== row.id))
      setJourneyErr(null)
    } catch (e) {
      setJourneyErr(errMsg(e))
    }
  }

  // 标签候选：当前条目 tags 的并集（数据驱动，无全局标签库）
  const journeyPool = [...new Set(journey.flatMap((n) => n.tags))]

  return (
    <section id="about-journey" className="mt-14 scroll-mt-20">
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <SectionHeading
          num="#04"
          zh="足迹"
          en="Journey"
          className="flex flex-1 flex-wrap items-center gap-4"
        />
        <a
          href="/about"
          target="_blank"
          rel="noreferrer"
          className="ml-auto font-mono text-[11px] text-faint transition-colors hover:text-neon"
        >
          // 列表按时间降序 · C 端即刻可见
        </a>
      </div>
      {journeyErr && (
        <div className="mb-3">
          <ErrBar text={journeyErr} />
        </div>
      )}
      {journey.length === 0 ? (
        <EmptyState
          title="暂无足迹节点"
          description="// C 端关于页即刻可见"
          action={{
            label: '添加节点',
            onClick: () => setJourneyModal({ mode: 'create', row: null }),
          }}
        />
      ) : (
        <div className="flex flex-col">
          {/* 列表顺序即 C 端展示顺序：读侧固定时间降序（后端排序），无手动拖拽 */}
          {journey.map((node) => (
            <div key={node.id} className="flex gap-4">
              <div className="relative flex w-4 shrink-0 justify-center">
                <div
                  aria-hidden="true"
                  className={`absolute bottom-0 top-2.5 border-l border-dashed border-edge ${
                    node === journey[journey.length - 1] ? 'hidden' : ''
                  }`}
                />
                <span
                  aria-hidden="true"
                  className="relative mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neon"
                />
              </div>
              <div className="min-w-0 flex-1 pb-7">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-faint">{node.time || '—'}</span>
                  <span className="font-semibold">{node.title || '未命名节点'}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`编辑 ${node.title || '节点'}`}
                      onClick={() => setJourneyModal({ mode: 'edit', row: node })}
                      className="border border-edge p-1.5 text-faint transition-colors hover:border-neon/60 hover:text-neon"
                    >
                      <PencilSimple size={13} />
                    </button>
                    <ConfirmDeleteButton
                      name={node.title || '节点'}
                      onConfirm={() => void removeJourney(node)}
                    />
                  </div>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-dim">{node.description}</p>
                <TagSpans className="mt-2" value={node.tags} />
              </div>
            </div>
          ))}
        </div>
      )}
      {journey.length > 0 && (
        <div className="mt-1">
          <AddButton
            label="添加节点"
            onClick={() => setJourneyModal({ mode: 'create', row: null })}
          />
        </div>
      )}

      {journeyModal && (
        <JourneyModalForm
          key={journeyModal.mode === 'edit' ? `edit-${journeyModal.row?.id}` : 'create'}
          mode={journeyModal.mode}
          row={journeyModal.row}
          pool={journeyPool}
          onClose={() => setJourneyModal(null)}
          onSaved={() => {
            setJourneyModal(null)
            void reloadJourney()
          }}
        />
      )}
    </section>
  )
}
