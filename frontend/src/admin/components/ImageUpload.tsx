import { useRef, useState } from 'react'
import { ImageSquare, TrashSimple } from '@phosphor-icons/react'
import { api, errMsg } from '../../lib/api'
import type { UploadResult } from '../../types/api'

function isImage(file: File): boolean {
  return file.type.startsWith('image/')
}

// 真上传（docs/API/upload.md #U1）：multipart 中转，服务端统一校验/转 WebP/写桶。
// 前端不再参与 presign/直传；大小与格式由后端魔数嗅探校验，400 文案原样透出
export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await api.post<UploadResult>('/api/admin/uploads', fd, true)
  return res.public_url
}

interface ImageUploadProps {
  value: string | null
  onChange: (value: string | null) => void
  label?: string
}

// 单图上传：头像 / 封面
export function ImageUpload({ value, onChange, label }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [meta, setMeta] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const pick = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file || busy) return
    setErr(null)
    setBusy(true)
    const info = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`
    setMeta(`${info} · 上传中…`)
    try {
      const url = await uploadImage(file)
      setMeta(info)
      onChange(url)
    } catch (e) {
      setMeta(null)
      setErr(errMsg(e, '上传失败，请重试'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files)
          e.target.value = ''
        }}
      />
      {value ? (
        <div className="flex items-center gap-3">
          <img
            src={value}
            alt={label || '已上传图片'}
            className="h-16 w-24 border border-edge object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-neon">✓ 已上传</p>
            {meta && <p className="mt-0.5 truncate font-mono text-[11px] text-faint">{meta}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="border border-edge px-2.5 py-1 font-mono text-xs text-dim transition-colors hover:border-neon/50 hover:text-neon"
            >
              重新上传
            </button>
            <button
              type="button"
              onClick={() => {
                setMeta(null)
                setErr(null)
                onChange(null)
              }}
              className="border border-edge px-2.5 py-1 font-mono text-xs text-dim transition-colors hover:border-pulse/60 hover:text-pulse"
            >
              移除
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-24 w-full flex-col items-center justify-center gap-1.5 border border-dashed border-edge text-faint transition-colors hover:border-neon/50 hover:text-neon"
        >
          <ImageSquare size={20} />
          <span className="font-mono text-xs">{busy ? '上传中…' : label || '点击上传图片'}</span>
        </button>
      )}
      {err && <p className="mt-2 font-mono text-[11px] text-pulse">{err}</p>}
    </div>
  )
}

interface MultiImageUploadProps {
  value: string[]
  onChange: (value: string[]) => void
  max?: number
}

// 多图上传：动态配图九宫格；逐张顺序直传保持顺序
export function MultiImageUpload({ value, onChange, max = 9 }: MultiImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const pick = async (files: FileList | null) => {
    if (!files || busy) return
    setErr(null)
    setBusy(true)
    const next = [...value]
    try {
      for (const file of Array.from(files)) {
        if (next.length >= max) break
        if (!isImage(file)) continue
        next.push(await uploadImage(file))
        onChange([...next])
      }
    } catch (e) {
      setErr(errMsg(e, '上传失败，请重试'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="flex flex-wrap gap-2.5">
        {value.map((src, i) => (
          <div key={`${src}-${i}`} className="group relative">
            <img
              src={src}
              alt={`配图 ${i + 1}`}
              className="h-20 w-20 border border-edge object-cover"
            />
            <button
              type="button"
              aria-label={`移除配图 ${i + 1}`}
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="absolute right-1 top-1 hidden border border-edge bg-void/85 p-1 text-dim transition-colors hover:text-pulse group-hover:block"
            >
              <TrashSimple size={11} />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 border border-dashed border-edge text-faint transition-colors hover:border-neon/50 hover:text-neon"
          >
            <ImageSquare size={17} />
            <span className="font-mono text-[10px]">{busy ? '…' : `${value.length}/${max}`}</span>
          </button>
        )}
      </div>
      {err && <p className="mt-2 font-mono text-[11px] text-pulse">{err}</p>}
      <p className="mt-2 font-mono text-[10px] text-faint">
        // 支持在正文输入框直接粘贴图片，自动上传并挂到配图
      </p>
    </div>
  )
}
