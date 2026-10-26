// 登录态 store（zustand）：localStorage 是唯一持久层，store 是其响应式镜像。
// setAuth/clearAuth 是唯一写入口（axios 401 轮换、OAuth 换凭证、登出都经此）；
// 组件经 useAuthStore 订阅获得响应式登录态，storage 事件补齐跨 tab 同步
import { create } from 'zustand'
import type { TokenPair, UserDTO } from '../types/api'

const ACCESS_KEY = 'blog.access_token'
const REFRESH_KEY = 'blog.refresh_token'
const USER_KEY = 'blog.user'

function readStoredUser(): UserDTO | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as UserDTO) : null
  } catch {
    return null
  }
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: UserDTO | null
  setAuth: (pair: TokenPair) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: localStorage.getItem(ACCESS_KEY),
  refreshToken: localStorage.getItem(REFRESH_KEY),
  user: readStoredUser(),
  setAuth: (pair) => {
    localStorage.setItem(ACCESS_KEY, pair.access_token)
    localStorage.setItem(REFRESH_KEY, pair.refresh_token)
    localStorage.setItem(USER_KEY, JSON.stringify(pair.user))
    set({ accessToken: pair.access_token, refreshToken: pair.refresh_token, user: pair.user })
  },
  clearAuth: () => {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
    set({ accessToken: null, refreshToken: null, user: null })
  },
}))

// 跨 tab 登录/登出同步：任一凭证键变化即重读三键
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== ACCESS_KEY && e.key !== REFRESH_KEY && e.key !== USER_KEY) return
    useAuthStore.setState({
      accessToken: localStorage.getItem(ACCESS_KEY),
      refreshToken: localStorage.getItem(REFRESH_KEY),
      user: readStoredUser(),
    })
  })
}
