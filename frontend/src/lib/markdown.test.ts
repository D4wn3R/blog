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
