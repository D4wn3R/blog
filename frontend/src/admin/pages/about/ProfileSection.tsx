import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api, errMsg } from '../../../lib/api'
import type { ProfileDTO } from '../../../types/api'
import { Field, Input, Textarea } from '../../components/ui'
import { SectionHeading } from '../../../components/SectionHeading'
import { ErrBar, RuneCount, SectionActions } from './parts'

// #01 资料卡（#B2 部分更新）：脏标记经 RHF isDirty 上报，撤销 = reset 回最近保存值；
// bio 为 markdown（C 端 about-prose 渲染），实时上报草稿供右栏预览
// 头像走 site_settings.site_image（D-site-settings），profile 表无 avatar 列
const profileSchema = z.object({
  nickname: z.string().trim().min(1, '昵称必填'),
  title_en: z.string(),
  bio: z.string().max(200, '简介不超过 200 字'),
})

type ProfileValues = z.infer<typeof profileSchema>

export function ProfileSection({
  initial,
  onStats,
  onData,
}: {
  initial: ProfileDTO
  onStats: (sectionId: string, count: number, dirty: boolean) => void
  onData: (d: { kind: 'profile'; data: ProfileDTO }) => void
}) {
  const [lastSaved, setLastSaved] = useState({
    nickname: initial.nickname,
    title_en: initial.title_en,
    bio: initial.bio,
  })
  const [profileErr, setProfileErr] = useState<string | null>(null)

  // AdminAbout 以 key={loadTick} 重挂载本分区，initial 每次挂载都是新值
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isDirty, errors, isSubmitting },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: lastSaved,
  })
  const bio = watch('bio')
  const nickname = watch('nickname')
  const titleEn = watch('title_en')
  const nickErr = !!errors.nickname

  useEffect(() => {
    onStats('about-identity', 0, isDirty)
  }, [onStats, isDirty])

  // 实时上报预览草稿（bio 是 markdown，预览列渲染渲染结果）
  useEffect(() => {
    onData({ kind: 'profile', data: { nickname, title_en: titleEn, bio } })
  }, [onData, nickname, titleEn, bio])

  const onSubmit = handleSubmit(async (values) => {
    setProfileErr(null)
    try {
      const res = await api.put<ProfileDTO>('/api/admin/about/profile', {
        nickname: values.nickname.trim(),
        title_en: values.title_en,
        bio: values.bio,
      })
      const next = {
        nickname: res.nickname,
        title_en: res.title_en,
        bio: res.bio,
      }
      setLastSaved(next)
      reset(next)
    } catch (e) {
      setProfileErr(errMsg(e))
      throw e instanceof Error ? e : new Error(errMsg(e)) // SaveButton 回到待保存态
    }
  })

  const undoProfile = () => {
    reset(lastSaved)
    setProfileErr(null)
  }

  return (
    <section id="about-identity" className="scroll-mt-20">
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <SectionHeading
          num="#01"
          zh="资料卡"
          en="Identity"
          className="flex flex-1 flex-wrap items-center gap-4"
        />
        <SectionActions
          dirty={isDirty}
          onUndo={undoProfile}
          onSave={() =>
            onSubmit()
              .then(() => true)
              .catch(() => false)
          }
          saveLabel="保存资料"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 border border-edge bg-panel p-5 md:grid-cols-2">
        <Field label="昵称">
          <Input {...register('nickname')} error={nickErr} />
        </Field>
        <Field label="英文头衔">
          <Input {...register('title_en')} />
        </Field>
        <div className="md:col-span-2">
          <Field label="简介" hint="支持 Markdown，右侧预览实时渲染">
            <Textarea
              {...register('bio')}
              rows={6}
              maxLength={200}
              error={!!errors.bio}
              onEnterSubmit={() => {
                if (isDirty && !isSubmitting) void onSubmit()
              }}
              className="font-mono text-xs"
            />
            <RuneCount value={bio} max={200} />
          </Field>
        </div>
      </div>
      {(errors.nickname || errors.bio) && (
        <p className="mt-2 font-mono text-[11px] text-pulse">
          {errors.nickname?.message ?? errors.bio?.message}
        </p>
      )}
      {profileErr && (
        <div className="mt-2">
          <ErrBar text={profileErr} />
        </div>
      )}
    </section>
  )
}
