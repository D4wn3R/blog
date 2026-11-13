import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CONTACT_EMAIL } from '../lib/site'
import { Footer } from './Footer'

describe('Footer 页脚链接', () => {
  it('GitHub 入口指向作者主页并在新标签页打开', () => {
    render(<Footer />)
    const link = screen.getByRole('link', { name: 'GitHub' })
    expect(link).toHaveAttribute('href', 'https://github.com/D4wn3R')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('邮件入口为纯 mailto 链接，不带默认主题或正文参数', () => {
    render(<Footer />)
    const link = screen.getByRole('link', { name: '邮件' })
    expect(link).toHaveAttribute('href', `mailto:${CONTACT_EMAIL}`)
    expect(link.getAttribute('href')).not.toContain('?')
  })

  it('RSS 入口仍指向 /feed.xml', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: 'RSS 订阅' })).toHaveAttribute(
      'href',
      '/feed.xml',
    )
  })

  it('GitHub 与邮件入口键盘可聚焦且具有明确可访问名称', async () => {
    render(<Footer />)
    const user = userEvent.setup()
    await user.tab()
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveFocus()
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'aria-label',
    )
    await user.tab()
    expect(screen.getByRole('link', { name: '邮件' })).toHaveFocus()
    expect(screen.getByRole('link', { name: '邮件' })).toHaveAttribute(
      'aria-label',
    )
  })
})
