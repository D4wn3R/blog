import { useState } from 'react'

// 头像直用后端 URL；空值或加载失败（外链失效/防盗链）时渲染同尺寸空态块，不做占位图回退
export function UserAvatar({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className: string
}) {
  const [failed, setFailed] = useState(false)
  // src 变化时重置失败标记（同一组件位复用不同头像，如列表重排）
  const [prevSrc, setPrevSrc] = useState(src)
  if (src !== prevSrc) {
    setPrevSrc(src)
    setFailed(false)
  }

  return src && !failed ? (
    <img src={src} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} />
  ) : (
    <div className={className} aria-label={alt} />
  )
}
