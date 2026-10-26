// API 客户端（axios + fetch adapter，传输原语与浏览器/测试环境的 fetch mock 一致）：
// 401 单飞轮换重放（docs/API/auth.md #6 严格轮换），导出面与原 fetch 版一致
import axios, { type AxiosError, type AxiosRequestConfig } from 'axios'
import { useAuthStore } from './authStore'
import type { TokenPair, UserDTO } from '../types/api'

interface ApiBody<T> {
  code: number
  message: string
  data?: T
}

export class ApiError extends Error {
  status: number
  code: number

  constructor(status: number, code: number, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken
}

export function getRefreshToken(): string | null {
  return useAuthStore.getState().refreshToken
}

export function getStoredUser(): UserDTO | null {
  return useAuthStore.getState().user
}

export function setAuth(pair: TokenPair): void {
  useAuthStore.getState().setAuth(pair)
}

export function clearAuth(): void {
  useAuthStore.getState().clearAuth()
}

// 单飞轮换：#6 GETDEL 严格轮换下，旧 token 首个 401 后立即作废，
// 并发请求必须共享同一次 refresh，否则后来者拿旧 token 再刷会 40100 全体登出
let refreshInFlight: Promise<boolean> | null = null

async function refreshTokens(): Promise<boolean> {
  const rt = getRefreshToken()
  if (!rt) return false
  try {
    const res = await http.post<ApiBody<TokenPair>>('/api/auth/refresh', {
      refresh_token: rt,
    })
    const body = res.data
    if (res.status === 200 && body.code === 0 && body.data) {
      setAuth(body.data)
      return true
    }
  } catch {
    // 网络异常同样按轮换失败处理，清凭证走重登
  }
  clearAuth()
  return false
}

// axios 实例：fetch adapter（传输原语与旧实现一致）；auth/_retry 为自定义字段
// 显式同源 baseURL：浏览器下与相对路径行为一致，且让 Node/测试环境的
// fetch adapter 能解析出绝对 URL（其不接受裸相对路径）
const http = axios.create({ adapter: 'fetch', baseURL: window.location.origin })

interface RequestConfigEx extends AxiosRequestConfig {
  // 自定义字段避开 axios 内建名（auth=HTTP Basic 凭证）
  useAuth?: boolean
  blogRetry?: boolean
}

// 请求拦截器：Bearer 注入（替代原 fetch 手工拼 Headers）
http.interceptors.request.use((config) => {
  const ex = config as RequestConfigEx
  if (ex.useAuth) {
    const token = getAccessToken()
    if (token) config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

// 响应拦截器：401 → 单飞轮换 → 用新 token 重放原请求一次
//（_retry 防二次刷新死循环；语义与原 fetch 版完全一致）
http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as RequestConfigEx | undefined
    if (
      error.response?.status === 401 &&
      config?.useAuth &&
      !config.blogRetry &&
      getRefreshToken()
    ) {
      refreshInFlight ??= refreshTokens().finally(() => {
        refreshInFlight = null
      })
      if (await refreshInFlight) {
        config.blogRetry = true
        return http.request(config)
      }
      throw new ApiError(401, 40100, '登录已过期，请重新登录')
    }
    return Promise.reject(error)
  },
)

async function request<T>(path: string, init: RequestConfigEx = {}): Promise<T> {
  try {
    const res = await http.request<ApiBody<T>>({
      url: path,
      method: init.method ?? 'GET',
      data: init.data,
      useAuth: init.useAuth,
      blogRetry: init.blogRetry,
    } as RequestConfigEx)
    const body = res.data
    if (!body || body.code !== 0) {
      throw new ApiError(res.status, body?.code ?? 50000, body?.message ?? '服务异常，请稍后重试')
    }
    return body.data as T
  } catch (e) {
    if (e instanceof ApiError) throw e
    // 非 2xx（业务错误码随 HTTP 状态返回）与网络异常归一为 ApiError
    if (axios.isAxiosError<ApiBody<unknown>>(e)) {
      const body = e.response?.data
      throw new ApiError(
        e.response?.status ?? 0,
        body?.code ?? 50000,
        body?.message ?? '服务异常，请稍后重试',
      )
    }
    throw e
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  getAuth: <T>(path: string) => request<T>(path, { useAuth: true }),
  post: <T>(path: string, body?: unknown, useAuth = false) =>
    request<T>(path, { method: 'POST', data: body, useAuth }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', data: body, useAuth: true }),
  del: (path: string) => request<null>(path, { method: 'DELETE', useAuth: true }),
}

// query 拼接：undefined/''/0 的值跳过（0 需要传时显式用字符串）
export function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== 0) search.set(key, String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

// 失败文案归一：Error 透传 message，非 Error 形态（手动 throw 的裸值）用兜底文案；
// 调用方可传语境化 fallback（如上传）
export function errMsg(e: unknown, fallback = '请求失败，请稍后重试'): string {
  return e instanceof Error ? e.message : fallback
}

export { fmtDate, fmtDateDot, fmtDateTime, fmtYearMonth } from './time'
