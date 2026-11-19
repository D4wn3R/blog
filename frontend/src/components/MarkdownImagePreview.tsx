import { useEffect, useRef, useState } from 'react'

interface Preview {
  src: string
  alt: string
}

// Markdown 图片全屏预览：正文 HTML 由 dangerouslySetInnerHTML 注入，React 无法在
// 注入子树里挂事件，故在 document 上做点击委托。预览层全屏深色、只显示图片，
// 点击图片以外的区域或按 Esc 退出。
export function MarkdownImagePreview() {
  const [preview, setPreview] = useState<Preview | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const img = event.target.closest('.md-figure img')
      if (!(img instanceof HTMLImageElement)) return
      // 图片可能包在 Markdown 链接里：预览优先，阻止跳转
      event.preventDefault()
      setPreview({ src: img.currentSrc || img.src, alt: img.alt })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    if (!preview) return
    overlayRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [preview])

  if (!preview) return null

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-void outline-none"
      onClick={() => setPreview(null)}
    >
      {/* 点击图片本身不关闭；周围空白（overlay 自身）关闭 */}
      <img
        src={preview.src}
        alt={preview.alt}
        className="max-h-[92vh] max-w-[92vw] object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  )
}
