// 401 单飞轮换回归测试（docs/API/auth.md #6 严格轮换）：GETDEL 下旧 token 首个 401 即作废，
// 并发各自 refresh 会让后来者携带旧 token → 40100 全体登出。重构 request()/refreshInFlight 前请保持这组用例全绿
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, clearAuth, setAuth } from './api'
import type { TokenPair, UserDTO } from '../types/api'

const user: UserDTO = {
  id: 1,
  username: 'admin',
  email: 'admin.com',
  avatar: '',
  role: 'admin',
}
const oldPair: TokenPair = {
  access_token: 'old-access',
  expires_in: 900,
  refresh_token: 'rt-1',
  user,
}
const newPair: TokenPair = {
  access_token: 'new-access',
  expires_in: 900,
  refresh_token: 'rt-2',
  user,
}

// 轻量 Response 替身：request()/refreshTokens() 只读 ok/status/json；
// axios fetch adapter 以 new Request 单参调用 fetch 并默认读 text()，一并提供
function mockRes(status: number, body: unknown): Response {
  const raw = JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => raw,
  } as unknown as Response
}

// 兼容两种 fetch 形态：axios 传单个 Request（url 为绝对路径），旧用法传 (url, init)
function readCall(
  input: RequestInfo | URL,
  init?: RequestInit,
): { path: string; auth: string | null } {
  const raw = typeof input === 'string' ? input : (input as Request).url
  const headers = (init?.headers ??
    (typeof input === 'object' ? (input as Request).headers : undefined)) as Headers
  return { path: new URL(raw).pathname, auth: headers?.get('Authorization') ?? null }
}

const KEYS = ['blog.access_token', 'blog.refresh_token', 'blog.user']

beforeEach(() => {
  clearAuth()
  for (const k of KEYS) localStorage.removeItem(k)
})

describe('401 单飞轮换（#6 严格轮换）', () => {
  it('并发 3 个 401 → refresh 只发一次，全部请求用新 token 重放成功', async () => {
    setAuth(oldPair)
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { path, auth } = readCall(input, init)
      if (path === '/api/auth/refresh') {
        return mockRes(200, { code: 0, message: 'ok', data: newPair })
      }
      if (auth === 'Bearer new-access') {
        return mockRes(200, { code: 0, message: 'ok', data: 'payload' })
      }
      return mockRes(401, { code: 40100, message: 'token 已轮换' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await Promise.all([
      api.getAuth<string>('/api/protected'),
      api.getAuth<string>('/api/protected'),
      api.getAuth<string>('/api/protected'),
    ])

    expect(results).toEqual(['payload', 'payload', 'payload'])
    const refreshCalls = fetchMock.mock.calls.filter(
      ([u]) => readCall(u).path === '/api/auth/refresh',
    )
    expect(refreshCalls).toHaveLength(1)
    const protectedCalls = fetchMock.mock.calls.filter(
      ([u]) => readCall(u).path === '/api/protected',
    )
    // 首轮 3 次（旧 token）+ 重放 3 次（新 token）
    expect(protectedCalls).toHaveLength(6)
    const authHeaders = protectedCalls.map(([u, i]) => readCall(u, i).auth)
    expect(authHeaders.filter((h) => h === 'Bearer old-access')).toHaveLength(3)
    expect(authHeaders.filter((h) => h === 'Bearer new-access')).toHaveLength(3)
  })

  it('refresh 失败 → 清除三键凭证并抛 ApiError(401, 40100)', async () => {
    setAuth(oldPair)
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = readCall(input, init).path
      if (path === '/api/auth/refresh') {
        return mockRes(200, { code: 40100, message: 'refresh token 无效' })
      }
      return mockRes(401, { code: 40100, message: 'token 已轮换' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const err = await api.getAuth<string>('/api/protected').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(401)
    expect((err as ApiError).code).toBe(40100)
    expect(localStorage.getItem('blog.access_token')).toBeNull()
    expect(localStorage.getItem('blog.refresh_token')).toBeNull()
    expect(localStorage.getItem('blog.user')).toBeNull()
  })
})

describe('响应解包与业务错误', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('code=0 解包 data 返回', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockRes(200, { code: 0, message: 'ok', data: { hello: 'world' } })),
    )
    await expect(api.get<{ hello: string }>('/api/anything')).resolves.toEqual({
      hello: 'world',
    })
  })

  it('code!==0 抛 ApiError 且 message 透传', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockRes(200, { code: 40900, message: '该标签已存在' })),
    )
    const err = await api.get('/api/anything').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe(40900)
    expect((err as ApiError).message).toBe('该标签已存在')
  })
})
