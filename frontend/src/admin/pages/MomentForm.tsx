import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ImageSquare } from '@phosphor-icons/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api, errMsg } from '../../lib/api'
import { useMoment } from '../../lib/queries'
import { uploadImage } from '../components/ImageUpload'
import { Button, Card, Field, PageHeader, Textarea } from '../components/ui'
import { MultiImageUpload } from '../components/ImageUpload'

// 动态新增 / 编辑共用表单：正文 + 配图（≤9），正文支持粘贴截图自动挂到配图。
// 编辑模式经 #M1 列表按 id 过滤回显（契约无单条接口），保存为 #M2/#M3 全量替换
const momentSchema = z.object({
  content: z.string().trim().min(1, '正文必填').max(1000, '正文不超过 1000 字'),
  images: z.array(z.string()).max(9, '配图不超过 9 张'),
})

type MomentValues = z.infer<typeof momentSchema>

export function MomentForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = id !== undefined && id !== 'new'

  const [pasteHint, setPasteHint] = useState<{ ok: boolean; text: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const momentQuery = useMoment(editing ? (id ?? '') : '')

  const {
    watch,
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<MomentValues>({
    resolver: zodResolver(momentSchema),
    defaultValues: { content: '', images: [] },
  })
  const images = watch('images')

  // 编辑回显（query 翻页查找到目标后灌入）
  useEffect(() => {
    if (!editing) return
    if (momentQuery.isError) {
      setErr(errMsg(momentQuery.error))
      return
    }
    const found = momentQuery.data
    if (found) {
      reset({ content: found.content, images: found.images })
    }
  }, [editing, momentQuery.data, momentQuery.isError, reset])

  // 粘贴截图 → 直传后挂为配图
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return
    e.preventDefault()
    setPasteHint({ ok: true, text: '截图上传中…' })
    try {
      const added: string[] = []
      for (const f of files) {
        if (images.length + added.length >= 9) break
        added.push(await uploadImage(f))
      }
      setValue('images', [...images, ...added].slice(0, 9), { shouldDirty: true })
      setPasteHint({ ok: true, text: `✓ ${added.length} 张截图已自动上传` })
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setPasteHint(null), 3500)
    } catch (pasteErr) {
      setPasteHint({
        ok: false,
        text: pasteErr instanceof Error ? pasteErr.message : '上传失败，请重试',
      })
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setErr(null)
    try {
      const body = { content: values.content.trim(), images: values.images }
      if (editing) await api.put(`/api/admin/moments/${id}`, body)
      else await api.post('/api/admin/moments', body, true)
      navigate('/admin/moments')
    } catch (saveErr) {
      setErr(errMsg(saveErr))
    }
  })

  const loading = editing && momentQuery.isPending
  const loadErr =
    editing && momentQuery.isError
      ? errMsg(momentQuery.error)
      : editing && momentQuery.isSuccess && !momentQuery.data
        ? '动态不存在或已被删除'
        : null

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

  return (
    <div className="mx-auto max-w-2xl p-8">
      <PageHeader
        title={editing ? '编辑动态' : '发动态'}
        actions={
          <div className="flex gap-2.5">
            <Button onClick={() => navigate('/admin/moments')}>取消</Button>
            <Button variant="primary" loading={isSubmitting} onClick={() => void onSubmit()}>
              {editing ? '保存修改' : '发布'}
            </Button>
          </div>
        }
      />

      <Card className="mt-6 flex flex-col gap-5 p-6">
        <Field label="正文" hint="必填，≤1000 字，可直接粘贴截图" error={errors.content?.message}>
          <div>
            <Textarea
              rows={4}
              maxLength={1000}
              onPaste={(e) => void handlePaste(e)}
              onEnterSubmit={() => {
                if (!isSubmitting) void onSubmit()
              }}
              placeholder="记一点今天的事……"
              {...register('content')}
            />
            {pasteHint && (
              <p
                className={`mt-1.5 font-mono text-xs ${pasteHint.ok ? 'text-neon' : 'text-pulse'}`}
              >
                {pasteHint.text}
              </p>
            )}
          </div>
        </Field>

        <Field label="配图" hint="≤9 张">
          <div>
            {images.length === 0 && (
              <p className="mb-2 flex items-center gap-1.5 font-mono text-xs text-faint">
                <ImageSquare size={12} />
                暂无配图
              </p>
            )}
            <MultiImageUpload
              value={images}
              onChange={(next) => setValue('images', next, { shouldDirty: true })}
              max={9}
            />
          </div>
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
