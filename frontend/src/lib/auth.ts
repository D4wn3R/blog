// 登录体系：GitHub OAuth 跳转入口（#2）、auth_code 换凭证（#5）、登出（#7）、
// 当前用户（#8）；登录态即 localStorage 三键（api.ts ACCESS/REFRESH/USER）
import { api, clearAuth, getAccessToken, getRefreshToken, getStoredUser, setAuth } from './api'
import type { TokenPair, UserDTO } from '../types/api'

// 登录完成后要回的页面（#3 回调不透传来源，用 localStorage 记录去向）
const NEXT_KEY = 'blog.oauth_next'

export function startOAuth(next: string): void {
  localStorage.setItem(NEXT_KEY, next)
  // 后端 #2 生成 state 后 302 到 GitHub 授权页
  window.location.href = '/api/oauth/github/authorize'
}

export function consumeOAuthNext(): string {
  const next = localStorage.getItem(NEXT_KEY) ?? '/posts'
  localStorage.removeItem(NEXT_KEY)
  return next
}

export async function exchangeAuthCode(code: string): Promise<UserDTO> {
  const pair = await api.post<TokenPair>('/api/auth/exchange', { code })
  setAuth(pair)
  return pair.user
}

export async function logout(): Promise<void> {
  const rt = getRefreshToken()
  if (rt) {
    // #7 归属不符静默成功；本地无论接口结果都清登录态
    await api.post('/api/auth/logout', { refresh_token: rt }, true).catch(() => {})
  }
  clearAuth()
}

export async function fetchMe(): Promise<UserDTO> {
  return api.getAuth<UserDTO>('/api/user/me')
}

export function isLoggedIn(): boolean {
  return !!getAccessToken()
}

export function isAdmin(): boolean {
  return getStoredUser()?.role === 'admin'
}
