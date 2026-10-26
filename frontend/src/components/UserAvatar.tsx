// 头像直用后端 URL；空值渲染同尺寸空态块，不做占位图回退
export function UserAvatar({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className: string
}) {
  return src ? (
    <img src={src} alt={alt} className={className} loading="lazy" />
  ) : (
    <div className={className} aria-label={alt} />
  )
}
