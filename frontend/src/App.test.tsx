import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SiteLayout } from './App'

// site-root 是 C 端字体栈的挂载点：index.css 经它级联覆盖 --font-sans / --font-mono，
// B 端（AdminLayout / CodeMirror）不经过该容器，字体栈保持原样。
describe('SiteLayout', () => {
  it('根容器挂载 site-root 类，C 端字体栈作用域生效', () => {
    // 文章详情路径不挂粒子层，避免 jsdom 触发 ParticlesFX 懒加载
    render(
      <MemoryRouter initialEntries={['/posts/1']}>
        <SiteLayout />
      </MemoryRouter>,
    )
    const root = document.querySelector('.site-root')
    expect(root).not.toBeNull()
    expect(root).toHaveClass('flex', 'min-h-dvh', 'flex-col')
  })
})
