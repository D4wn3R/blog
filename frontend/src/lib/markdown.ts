import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import footnote from 'markdown-it-footnote'
import mark from 'markdown-it-mark'
import taskLists from 'markdown-it-task-lists'
import * as katexModule from 'katex'
import texmath from 'markdown-it-texmath'
// KaTeX 样式随本模块的 chunk 加载：只有渲染 markdown 的路由（文章/关于）才拉取，
// 不再进全局 CSS（首页无公式，白传 20+kB）
import 'katex/dist/katex.min.css'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import go from 'highlight.js/lib/languages/go'
import http from 'highlight.js/lib/languages/http'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdownLang from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

// 按需注册语言（技术博客常用），避免引入 highlight.js 全量 190+ 语言
const LANGUAGES = {
  go,
  bash,
  css,
  diff,
  http,
  javascript: javascript,
  typescript: typescript,
  json,
  markdown: markdownLang,
  python,
  sql,
  xml,
  yaml,
} as const
for (const [name, def] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, def)
}
// 常见别名
hljs.registerAliases(['html', 'vue'], { languageName: 'xml' })
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' })
hljs.registerAliases(['js', 'jsx'], { languageName: 'javascript' })
hljs.registerAliases(['sh', 'shell', 'zsh'], { languageName: 'bash' })

// C 端 Markdown 渲染基线（backend/docs/spec/article/spec.md §渲染基线）：
// 后端只存 content_md，前端 markdown-it 渲染 + DOMPurify 清洗
// 语法覆盖：CommonMark + GFM（表格/删除线/任务列表/自动链接）+ 脚注 + ==标记==
//          + LaTeX 公式（$…$ 行内 / $$…$$ 块级，KaTeX）+ Mermaid 图（```mermaid）
const escapeHtml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const md = new MarkdownIt({
  html: false,
  linkify: true,
  highlight(code: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      return `<pre class="hljs"><code>${hljs.highlight(code, { language: lang }).value}</code></pre>`
    }
    return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`
  },
})
  .use(taskLists, { enabled: true, label: true })
  .use(footnote)
  .use(mark)
  .use(texmath, {
    // texmath 约定：engine 本身要带 renderToString 方法（内部直接 engine.renderToString）
    engine: {
      renderToString: (tex: string, opts?: object) =>
        (katexModule.renderToString as (tex: string, opts?: object) => string)(tex, opts),
    },
    delimiters: 'dollars',
    katexOptions: { throwOnError: false },
  })

// mermaid 代码块：输出占位容器，挂载后由 mermaid.run() 替换为 SVG
const defaultFence = md.renderer.rules.fence
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  if (token.info.trim() === 'mermaid') {
    return `<div class="md-mermaid"><pre class="mermaid">${escapeHtml(token.content)}</pre></div>`
  }
  return defaultFence?.(tokens, idx, options, env, self) ?? ''
}

// 目录（TOC）：h1/h2/h3 注入稳定 id，并导出目录结构给文章页侧栏

export interface TocItem {
  id: string
  text: string
  level: 1 | 2 | 3
}

// 标题 → id：保留中英文与数字，连续空白/标点折叠为 '-'；同名标题追加序号保证唯一
function headingSlug(text: string, seen: Map<string, number>): string {
  const base =
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'heading'
  const n = seen.get(base) ?? 0
  seen.set(base, n + 1)
  return n === 0 ? base : `${base}-${n}`
}

// 两次解析产生相同的标题序列，seen 计数保证 extractToc 与渲染出的 id 一一对应；
// 采集 h1/h2/h3（作者可用 # 作小节标题，目录须跟随实际层级）
export function extractToc(source: string): TocItem[] {
  const seen = new Map<string, number>()
  const items: TocItem[] = []
  const tokens = md.parse(source, {})
  tokens.forEach((token, i) => {
    if (token.type !== 'heading_open') return
    const level = Number(token.tag.slice(1))
    if (level !== 1 && level !== 2 && level !== 3) return
    const text = tokens[i + 1]?.content ?? ''
    items.push({ id: headingSlug(text, seen), text: text.trim(), level: level as 1 | 2 | 3 })
  })
  return items
}

// 同名计数按 tokens 数组隔离（每次 render 都是全新数组），与 extractToc 的 seen 逻辑等价
const slugCountsByTokens = new WeakMap<object, Map<string, number>>()

const defaultHeadingOpen = md.renderer.rules.heading_open
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  if (token.tag === 'h1' || token.tag === 'h2' || token.tag === 'h3') {
    let seen = slugCountsByTokens.get(tokens)
    if (!seen) {
      seen = new Map()
      slugCountsByTokens.set(tokens, seen)
    }
    token.attrSet('id', headingSlug(tokens[idx + 1]?.content ?? '', seen))
  }
  return (
    defaultHeadingOpen?.(tokens, idx, options, env, self) ?? self.renderToken(tokens, idx, options)
  )
}

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(md.render(source))
}
