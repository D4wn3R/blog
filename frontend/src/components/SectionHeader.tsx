interface SectionHeaderProps {
  title: string
  path: string
}

// 全站统一的 section 标题：色块 + 中文标题 + 终端路径装饰
export function SectionHeader({ title, path }: SectionHeaderProps) {
  return (
    <div className="mb-10 flex items-baseline justify-between gap-4">
      <h2 className="flex items-center gap-3 text-2xl font-semibold">
        <span className="inline-block h-5 w-1.5 bg-neon" aria-hidden="true" />
        {title}
      </h2>
      <span className="font-mono text-sm text-faint">{path}</span>
    </div>
  )
}
