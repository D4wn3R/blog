interface SectionHeadingProps {
  num: string
  zh: string
  en: string
  /** 覆盖默认 mb-8（如标题行右侧还要内联操作按钮时） */
  className?: string
}

// 区块标题：编号 + 中文 · 英文 + 渐变短线（友链节点布局语言）
// flex-wrap：窄屏下渐变线换行，避免固定 w-28 撑破容器
export function SectionHeading({ num, zh, en, className }: SectionHeadingProps) {
  return (
    <div className={className ?? 'mb-8 flex flex-wrap items-center gap-4'}>
      <span className="self-start font-mono text-sm text-faint">{num}</span>
      <h2 className="text-2xl font-bold tracking-tight">
        {zh}
        <span className="ml-2 font-mono text-lg font-medium text-dim">· {en}</span>
      </h2>
      <span aria-hidden="true" className="h-px w-28 bg-gradient-to-r from-neon/80 to-transparent" />
    </div>
  )
}
