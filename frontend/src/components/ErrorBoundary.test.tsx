import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ErrorBoundary } from './ErrorBoundary'

// 动态 import 失败自愈的行为级测试：
// onError 副作用触发 window.location.reload()，sessionStorage 守卫防循环

function Boom(): never {
  throw new Error('Failed to fetch dynamically imported module: https://x/AboutPage-BNULGt0o.js')
}

function OtherBoom(): never {
  throw new Error('普通渲染错误')
}

function quiet() {
  return vi.spyOn(console, 'error').mockImplementation(() => {})
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('ErrorBoundary 旧 chunk 自愈刷新', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('动态 import 失败时自动整页刷新一次', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    quiet()

    renderWithRouter(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('sessionStorage 守卫：同会话第二次失败不再刷新', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    quiet()

    renderWithRouter(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    renderWithRouter(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('非 chunk 类渲染错误不触发刷新', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    quiet()

    renderWithRouter(
      <ErrorBoundary>
        <OtherBoom />
      </ErrorBoundary>,
    )
    expect(reload).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('blog-chunk-reloaded')).toBeNull()
  })
})
