import { afterEach, describe, expect, it, vi } from 'vitest'
import { reloadOnceForStaleChunk } from './chunkReload'

const CHUNK_ERR = new Error(
  'Failed to fetch dynamically imported module: https://x/AboutPage-BNULGt0o.js',
)

describe('chunkReload 自愈守卫', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('chunk 错误首次触发刷新并写入守卫', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })

    expect(reloadOnceForStaleChunk(CHUNK_ERR)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('blog-chunk-reloaded')).toBe('1')
  })

  it('守卫生效：同会话第二次不再刷新', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })

    reloadOnceForStaleChunk(CHUNK_ERR)
    expect(reloadOnceForStaleChunk(CHUNK_ERR)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('sessionStorage 不可用时不刷新（防隐私模式刷新循环）', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable')
    })

    expect(reloadOnceForStaleChunk(CHUNK_ERR)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('非 chunk 错误不触发刷新', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })

    expect(reloadOnceForStaleChunk(new Error('普通渲染错误'))).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('Safari/Firefox 变体文案同样识别', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })

    expect(reloadOnceForStaleChunk(new Error('Importing a module script failed'))).toBe(true)
    expect(reloadOnceForStaleChunk(new Error('error loading dynamically imported module'))).toBe(
      false,
    ) // 守卫已在上一条写入
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
