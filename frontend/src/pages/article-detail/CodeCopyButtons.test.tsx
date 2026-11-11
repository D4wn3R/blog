import { useRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeCopyButtons } from './CodeCopyButtons'
import { renderMarkdown } from '../../lib/markdown'

// 正文容器 + 复制按钮挂载层的真实组合：按钮由组件在 HTML 注入后追加，
// 用 DOM 查询验证「每块一个按钮、Mermaid 没有、点击复制原文、状态自动复位」
function Harness({ source }: { source: string }) {
  const html = renderMarkdown(source)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <>
      <div ref={ref} data-testid="content" dangerouslySetInnerHTML={{ __html: html }} />
      <CodeCopyButtons contentRef={ref} html={html} />
    </>
  )
}

const _source = [
  '```go',
  'fmt.Println("hi")',
  '```',
  '',
  '```mermaid',
  'graph TD',
  'A-->B',
  '```',
  '',
  '```json',
  '{"a":1}',
  '```',
].join('\n')

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

function stubExecCommand(result: boolean) {
  Object.defineProperty(document, 'execCommand', { value: vi.fn(() => result), configurable: true })
}

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  Object.defineProperty(document, 'execCommand', { value: undefined, configurable: true })
})

describe('CodeCopyButtons', () => {
  it('每个普通代码块各挂一个按钮，Mermaid 块不挂', () => {
    const { container } = render(<Harness source={_source} />)

    const blocks = container.querySelectorAll('.md-code-block')
    expect(blocks).toHaveLength(2)
    for (const block of blocks) {
      expect(block.querySelectorAll('.md-code-copy')).toHaveLength(1)
    }
    const mermaid = container.querySelector('.md-mermaid')
    expect(mermaid).not.toBeNull()
    expect(mermaid?.querySelector('.md-code-copy')).toBeNull()
    // 重复渲染不应叠加按钮
    expect(container.querySelectorAll('.md-code-copy')).toHaveLength(2)
  })

  it('点击复制原文，成功态 1.2s 后复位', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(() => Promise.resolve())
    stubClipboard(writeText)
    stubExecCommand(true)

    const { container } = render(<Harness source={_source} />)
    const block = container.querySelectorAll<HTMLElement>('.md-code-block')[0]
    const button = block.querySelector<HTMLButtonElement>('.md-code-copy')
    if (!button) throw new Error('按钮未挂载')

    await act(async () => {
      fireEvent.click(button)
    })

    expect(writeText).toHaveBeenCalledWith('fmt.Println("hi")')
    expect(button.dataset.state).toBe('ok')
    expect(button.getAttribute('aria-label')).toBe('已复制')

    act(() => vi.advanceTimersByTime(1300))
    expect(button.dataset.state).toBe('idle')
    expect(button.getAttribute('aria-label')).toBe('复制代码')
  })

  it('两条复制路径都失败时显示失败态，不抛异常', async () => {
    vi.useFakeTimers()
    stubClipboard(() => Promise.reject(new Error('denied')))
    stubExecCommand(false)

    const { container } = render(<Harness source={_source} />)
    const button = container.querySelector<HTMLButtonElement>('.md-code-copy')
    if (!button) throw new Error('按钮未挂载')

    await act(async () => {
      fireEvent.click(button)
    })

    expect(button.dataset.state).toBe('fail')
    expect(button.getAttribute('aria-label')).toBe('复制失败')
  })
})