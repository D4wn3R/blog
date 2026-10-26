import type { ReactNode } from 'react'

interface PageShellProps {
  title: string
  path: string
  children: ReactNode
}

// 内页统一外壳：banner（终端路径 + 页面标题）+ 居中内容
export function PageShell({ title, path, children }: PageShellProps) {
  return (
    <>
      <header className="mx-auto w-full max-w-6xl px-6 pb-10 pt-14">
        <p className="mb-3 font-mono text-sm text-neon">$ cd {path}</p>
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{title}</h1>
      </header>

      <div className="mx-auto w-full max-w-6xl grow px-6 pb-20">
        <div className="mx-auto max-w-4xl">{children}</div>
      </div>
    </>
  )
}
