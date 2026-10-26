import { GithubLogo } from '@phosphor-icons/react'
import { startOAuth } from '../../lib/auth'

// B 端登录：GitHub OAuth（#2 跳授权，回调页校验 role 后携带凭证返回）
export function AdminLogin() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm border border-edge bg-panel p-8">
        <p className="font-mono text-sm text-neon">~/D4wn3R/admin</p>
        <h1 className="mt-3 font-mono text-2xl font-bold">admin login</h1>

        <button
          type="button"
          onClick={() => startOAuth('/admin')}
          className="mt-8 flex w-full items-center justify-center gap-3 border border-neon/70 px-6 py-3 font-mono text-sm text-neon transition-colors hover:bg-neon hover:text-void"
        >
          <GithubLogo size={18} />
          Continue with GitHub
        </button>
      </div>
    </div>
  )
}
