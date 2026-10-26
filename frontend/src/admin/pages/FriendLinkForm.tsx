import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api, errMsg } from '../../lib/api'
import { useFriendLinks } from '../../lib/queries'
import { Button, Card, Field, Input, PageHeader } from '../components/ui'

// 友链新增 / 编辑共用表单：#F2 创建、#F3 全量替换编辑（编辑经 #F1 按 id 过滤回显）
// 头像为友邻站点外链（与本站对象存储无关）：可空，非空须以 http(s):// 开头
const friendLinkSchema = z.object({
  name: z.string().trim().min(1, '站点名称必填').max(50, '不超过 50 字'),
  url: z
    .string()
    .trim()
    .regex(/^https?:\/\//, '站点地址需以 http(s):// 开头'),
  description: z.string().max(200, '不超过 200 字'),
  image: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\//.test(v), '头像需以 http(s):// 开头'),
})

type FriendLinkValues = z.infer<typeof friendLinkSchema>

export function FriendLinkForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = id !== undefined && id !== 'new'

  const [missing, setMissing] = useState(false)
  const [filled, setFilled] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const friendsQuery = useFriendLinks()
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<FriendLinkValues>({
    resolver: zodResolver(friendLinkSchema),
    defaultValues: { name: '', url: '', description: '', image: '' },
  })

  // 编辑回显：数据由 query 托管（与友链列表共享缓存），到位后一次性灌入表单
  useEffect(() => {
    if (!editing || filled || !friendsQuery.isSuccess) return
    const source = friendsQuery.data.find((f) => f.id === Number(id))
    if (source) {
      reset({
        name: source.name,
        url: source.url,
        description: source.description,
        image: source.image,
      })
      setFilled(true)
    } else {
      setMissing(true)
    }
  }, [editing, filled, id, friendsQuery.isSuccess, friendsQuery.data, reset])

  const onSubmit = handleSubmit(async (values) => {
    setErr(null)
    try {
      if (editing) await api.put(`/api/admin/friend-links/${id}`, values)
      else await api.post('/api/admin/friend-links', values, true)
      navigate('/admin/links')
    } catch (saveErr) {
      // url 唯一冲突（40900 该友链已存在）等后端文案原样行内展示
      setErr(errMsg(saveErr))
    }
  })

  const loading = editing && friendsQuery.isPending
  const loadErr = friendsQuery.isError ? errMsg(friendsQuery.error) : null

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <p className="text-sm text-faint">加载中…</p>
      </div>
    )
  }

  if (loadErr) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <p className="rounded-md border border-pulse/60 bg-pulse/10 px-4 py-2.5 text-sm text-pulse">
          {loadErr}
        </p>
      </div>
    )
  }

  if (missing) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <p className="rounded-md border border-pulse/60 bg-pulse/10 px-4 py-2.5 text-sm text-pulse">
          友链不存在或已被删除
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <PageHeader
        title={editing ? '编辑友链' : '新增友链'}
        actions={
          <div className="flex gap-2.5">
            <Button onClick={() => navigate('/admin/links')}>取消</Button>
            <Button variant="primary" loading={isSubmitting} onClick={() => void onSubmit()}>
              保存
            </Button>
          </div>
        }
      />

      <Card className="mt-6 flex flex-col gap-5 p-6">
        <Field label="站点名称" error={errors.name?.message}>
          <Input {...register('name')} maxLength={50} />
        </Field>
        <Field label="站点地址" hint="以 http(s):// 开头" error={errors.url?.message}>
          <Input {...register('url')} className="font-mono text-xs" />
        </Field>
        <Field label="站点简介" error={errors.description?.message}>
          <Input {...register('description')} maxLength={200} />
        </Field>
        <Field
          label="站长头像"
          hint="友邻站点头像外链 URL（http(s):// 开头），可空"
          error={errors.image?.message}
        >
          <Input {...register('image')} className="font-mono text-xs" />
        </Field>
        {err && (
          <p className="rounded-md border border-pulse/60 bg-pulse/10 px-4 py-2.5 text-sm text-pulse">
            {err}
          </p>
        )}
      </Card>
    </div>
  )
}
