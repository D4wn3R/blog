import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmptyLine, ErrorLine, LoadingLine } from './States'

// 三态占位组件：规范要求每个数据展示位 loading / error（含重试）/ empty 三态齐全
describe('States 三态组件', () => {
  it('LoadingLine 渲染默认与自定义文案', () => {
    render(<LoadingLine />)
    expect(screen.getByText('loading...')).toBeInTheDocument()
    const { unmount } = render(<LoadingLine text="加载中…" />)
    expect(screen.getByText('加载中…')).toBeInTheDocument()
    unmount()
  })

  it('ErrorLine 展示错误信息；无 onRetry 时不出重试按钮', () => {
    render(<ErrorLine message="boom" />)
    expect(screen.getByText('error: boom')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('ErrorLine 点击重试按钮触发回调', async () => {
    let retried = false
    render(<ErrorLine message="boom" onRetry={() => (retried = true)} />)
    await userEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(retried).toBe(true)
  })

  it('EmptyLine 渲染文案与 CTA 子元素', async () => {
    let clicked = false
    render(
      <EmptyLine text="no posts yet">
        <button type="button" onClick={() => (clicked = true)}>
          写文章
        </button>
      </EmptyLine>,
    )
    expect(screen.getByText('no posts yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '写文章' }))
    expect(clicked).toBe(true)
  })
})
