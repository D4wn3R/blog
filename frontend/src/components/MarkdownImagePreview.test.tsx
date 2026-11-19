import { fireEvent, render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../lib/markdown'
import { MarkdownImagePreview } from './MarkdownImagePreview'

// 正文 HTML 注入容器 + 根节点预览层的真实组合：
// 点击委托由 document 监听实现，这里验证开/关路径
function Harness() {
  const html = renderMarkdown('![自己画的板子（其实就是照抄别人的）](/files/x.webp)')
  return (
    <>
      <div data-testid="content" dangerouslySetInnerHTML={{ __html: html }} />
      <MarkdownImagePreview />
    </>
  )
}

function openPreview() {
  const view = render(<Harness />)
  const image = view.getByTestId('content').querySelector('img')
  if (!image) throw new Error('markdown 图片未渲染')
  fireEvent.click(image)
  return view
}

describe('MarkdownImagePreview', () => {
  it('点击图片打开预览，点击预览图片本身不关闭', () => {
    const { getByRole } = openPreview()
    const overlay = getByRole('dialog')
    expect(within(overlay).getByRole('img').getAttribute('src')).toBe(
      new URL('/files/x.webp', window.location.href).href,
    )

    fireEvent.click(within(overlay).getByRole('img'))
    expect(getByRole('dialog')).toBeInTheDocument()
  })

  it('点击图片以外的空白区域关闭预览', () => {
    const { getByRole, queryByRole } = openPreview()
    fireEvent.click(getByRole('dialog'))
    expect(queryByRole('dialog')).toBeNull()
  })

  it('按 Esc 关闭预览', () => {
    const { queryByRole } = openPreview()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(queryByRole('dialog')).toBeNull()
  })
})
