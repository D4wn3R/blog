import { GithubLogo } from '@phosphor-icons/react'
import { startOAuth } from '../lib/auth'

// C 端登录页：GitHub OAuth 授权，回调后由 OAuthCallback 换取凭证
export function Login() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-6">
      <div className="w-full max-w-sm border border-edge bg-panel p-8">
        <p className="font-mono text-sm text-neon">~/D4wn3R</p>
        <h1 className="mt-3 text-2xl font-bold">登录</h1>
        <p className="mt-2 text-sm leading-relaxed text-dim">登录后可发表评论、删除自己的评论。</p>

        <button
          type="button"
          onClick={() => startOAuth('/posts')}
          className="mt-8 flex w-full items-center justify-center gap-3 border border-neon/70 px-6 py-3 font-mono text-sm text-neon transition-colors hover:bg-neon hover:text-void"
        >
          <GithubLogo size={18} />
          Continue with GitHub
        </button>
      </div>
    </div>
  )
}
