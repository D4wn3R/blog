import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from './authStore'
import { clearAuth, getAccessToken, getRefreshToken, getStoredUser, setAuth } from './api'
import type { TokenPair } from '../types/api'

// 登录态流转：localStorage 是持久层，store 是响应式镜像；
// api.ts 的导出面（getAccessToken/setAuth/clearAuth…）必须与 store 保持一致
function makePair(id = 1): TokenPair {
  return {
    access_token: `access-${id}`,
    expires_in: 3600,
    refresh_token: `refresh-${id}`,
    user: { id, username: `user${id}`, email: '', avatar: '', role: 'admin' },
  }
}

describe('authStore 登录态流转', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null })
  })

  it('setAuth 写入三键并同步 store', () => {
    setAuth(makePair(7))
    expect(getAccessToken()).toBe('access-7')
    expect(getRefreshToken()).toBe('refresh-7')
    expect(getStoredUser()?.username).toBe('user7')
    expect(useAuthStore.getState().user?.role).toBe('admin')
  })

  it('clearAuth 清除三键与 store', () => {
    setAuth(makePair(1))
    clearAuth()
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(getStoredUser()).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('连续 setAuth 以最后一次为准（401 轮换场景）', () => {
    setAuth(makePair(1))
    setAuth(makePair(2))
    expect(getAccessToken()).toBe('access-2')
  })

  it('初始挂载从 localStorage 恢复（旧会话刷新页面）', () => {
    setAuth(makePair(3))
    // 模拟新模块加载：store 重置为与 localStorage 同步的初始态
    useAuthStore.setState({
      accessToken: localStorage.getItem('blog.access_token'),
      refreshToken: localStorage.getItem('blog.refresh_token'),
      user: JSON.parse(localStorage.getItem('blog.user') ?? 'null'),
    })
    expect(useAuthStore.getState().user?.id).toBe(3)
  })
})
