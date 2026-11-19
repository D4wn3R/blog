// renderMarkdown = markdown-it（html:false）+ DOMPurify 双层防线，是 C 端渲染的
// XSS 安全边界（spec 渲染基线）。这组用例锁住：裸 HTML 进不来、事件属性不存活、
// 代码块高亮链路正常——改动 md 实例配置或净化策略前请保持全绿
import { describe, expect, it } from 'vitest'
import { extractToc, renderMarkdown } from './markdown'

describe('renderMarkdown XSS 净化', () => {
  it('script 标签不进入输出（html:false 转义为文本）', () => {
    const out = renderMarkdown('hello <script>alert(1)</script>')
    expect(out).not.toContain('<script')
    expect(out).toContain('&lt;script&gt;')
  })

  it('img 的 onerror 不存活为可执行属性（裸 HTML 整体转义为惰性文本）', () => {
    const out = renderMarkdown('<img src=x onerror=alert(1)>')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })

  it('javascript: 链接不产生可点击 href', () => {
    const out = renderMarkdown('[click](javascript:alert(1))')
    expect(out).not.toContain('href="javascript')
    expect(out).not.toContain("href='javascript")
  })
})

describe('代码块渲染', () => {
  it('指定语言的代码块走 highlight.js 高亮', () => {
    const out = renderMarkdown('```go\nfunc main() {}\n```')
    expect(out).toContain('class="hljs"')
    expect(out).toContain('hljs-keyword')
  })

  it('未知语言回退为转义文本', () => {
    const out = renderMarkdown('```\n<b>&raw</b>\n```')
    expect(out).toContain('class="hljs"')
    expect(out).toContain('&lt;b&gt;')
  })

  it('普通代码块包一层 .md-code-block，代码文本逐字符保留（供复制按钮取原文）', () => {
    const source = 'fmt.Println("hi")\nif err != nil {\n\treturn err\n}'
    const out = renderMarkdown('```go\n' + source + '\n```')
    expect(out).toContain('class="md-code-block"')
    // 按钮由页面在 HTML 注入后挂载，静态 HTML 里不该出现按钮
    expect(out).not.toContain('md-code-copy')

    const host = document.createElement('div')
    host.innerHTML = out
    const block = host.querySelector('.md-code-block')
    expect(block).not.toBeNull()
    // hljs 只包 span，textContent 即 fence 原文（不是从高亮 HTML 反解析）；末尾换行来自 token
    expect(block?.querySelector('pre code')?.textContent).toBe(source + '\n')
  })

  it('Mermaid 不进普通代码块脚手架，也不产生复制按钮', () => {
    const out = renderMarkdown('```mermaid\ngraph TD\nA-->B\n```')
    expect(out).toContain('class="md-mermaid"')
    expect(out).not.toContain('md-code-block')
    expect(out).not.toContain('md-code-copy')
  })
})

describe('图片图注盒子', () => {
  const mount = (source: string) => {
    const host = document.createElement('div')
    host.innerHTML = renderMarkdown(source)
    return host
  }

  it('alt 渲染为图注，与 img 一起包进 .md-figure', () => {
    const alt = '自己画的板子（其实就是照抄别人的）'
    const host = mount(`![${alt}](/files/202611/board.webp)`)
    const figure = host.querySelector('.md-figure')
    expect(figure?.querySelector('img')?.getAttribute('alt')).toBe(alt)
    expect(figure?.querySelector('.md-figure-caption')?.textContent).toBe(alt)
  })

  it('alt 中的引号与尖括号转义为图注文本', () => {
    const host = mount('![a "b" <c>](/x.png)')
    expect(host.querySelector('.md-figure-caption')?.textContent).toBe('a "b" <c>')
    expect(host.querySelectorAll('img')).toHaveLength(1)
  })

  it('alt 为空仍包 .md-figure（可点击预览），但不渲染图注', () => {
    const host = mount('![](/x.png)')
    expect(host.querySelector('.md-figure img')).not.toBeNull()
    expect(host.querySelector('.md-figure-caption')).toBeNull()
  })
})

describe('extractToc 目录提取', () => {
  it('采集 h1/h2/h3 并按层级标记，h4+ 不收', () => {
    const toc = extractToc('# 一级\n\n## 二级\n\n### 三级\n\n#### 四级')
    expect(toc.map((t) => [t.level, t.text])).toEqual([
      [1, '一级'],
      [2, '二级'],
      [3, '三级'],
    ])
  })

  it('同名标题 id 追加序号保证唯一，且与渲染 id 一致', () => {
    const src = '## 标题\n\n正文\n\n## 标题'
    const toc = extractToc(src)
    expect(toc.map((t) => t.id)).toEqual(['标题', '标题-1'])
    const html = renderMarkdown(src)
    expect(html).toContain('id="标题"')
    expect(html).toContain('id="标题-1"')
  })
})
