import { useEffect, useState, type FormEvent } from 'react'
import { LockSimple } from '@phosphor-icons/react'

// 加密文章解锁面板：密码 → POST unlock（父层处理），成功后经 resetKey 清空输入
export function UnlockPanel({
  busy,
  error,
  resetKey,
  onSubmit,
}: {
  busy: boolean
  error: string
  resetKey: string
  onSubmit: (password: string) => void
}) {
  const [password, setPassword] = useState('')

  // 解锁成功（resetKey = unlockToken 变化）后清空输入，失败保留便于重试
  useEffect(() => {
    setPassword('')
  }, [resetKey])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const pwd = password.trim()
    if (!pwd || busy) return
    onSubmit(pwd)
  }

  return (
    <div className="mt-10 flex flex-col items-center border border-edge bg-panel px-6 py-16 text-center">
      <LockSimple size={40} weight="fill" className="text-pulse" />
      <p className="mt-5 text-lg font-semibold">此文章已加密</p>
      <p className="mt-2 font-mono text-xs text-faint">
        输入密码解锁全文 · 解锁后 10 分钟内免密阅读
      </p>
      <form className="mt-6 flex w-full max-w-xs gap-2" onSubmit={submit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="输入密码…"
          className="w-full border border-edge bg-void px-3.5 py-2.5 text-sm text-ink placeholder:text-faint focus:border-neon/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 border border-neon/60 bg-neon/10 px-5 font-mono text-sm text-neon transition-colors hover:bg-neon hover:text-void disabled:opacity-50"
        >
          解锁
        </button>
      </form>
      {error && <p className="mt-4 font-mono text-xs text-pulse">error: {error}</p>}
    </div>
  )
}
