// OAuth 回调落地页（后端 #3 永远 302 到 /oauth/callback?...）
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { exchangeAuthCode, consumeOAuthNext } from '../lib/auth'
import { ApiError } from '../lib/api'

const errorMessages: Record<string, string> = {
  denied: '你在 GitHub 侧拒绝了授权。',
  state_expired: '登录会话已过期，请重新发起登录。',
  banned: '账号已被禁用，请联系管理员。',
  oauth_failed: '登录失败，请稍后重试。',
}

export function OAuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (!code) {
      setError(errorMessages[params.get('error') ?? ''] ?? errorMessages.oauth_failed)
      return
    }
    // auth_code 一次性 60 秒，进页即消费
    exchangeAuthCode(code)
      .then((user) => {
        const next = consumeOAuthNext()
        // B 端入口但角色不是 admin：不放行，回 C 端
        if (next.startsWith('/admin') && user.role !== 'admin') {
          setError('该账号没有管理员权限。')
          return
        }
        navigate(next, { replace: true })
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : errorMessages.oauth_failed)
      })
  }, [navigate])

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm border border-edge bg-panel p-8 text-center">
        {error ? (
          <>
            <p className="font-mono text-sm text-neon">auth://callback</p>
            <h1 className="mt-3 text-xl font-bold">登录未完成</h1>
            <p className="mt-2 text-sm leading-relaxed text-dim">{error}</p>
            <Link
              to="/posts"
              className="mt-6 inline-block font-mono text-sm text-neon hover:underline"
            >
              &gt; 返回首页
            </Link>
          </>
        ) : (
          <p className="font-mono text-sm text-neon">正在登录…</p>
        )}
      </div>
    </div>
  )
}
