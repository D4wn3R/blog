import type mermaid from 'mermaid'

type MermaidApi = typeof mermaid

let mermaidPromise: Promise<MermaidApi> | null = null

// mermaid 体积大，动态加载：只有页面真的含 mermaid 图时才下载
async function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          primaryColor: '#0e1626',
          primaryTextColor: '#dbe6f5',
          primaryBorderColor: '#2ee6ff',
          lineColor: '#2ee6ff',
          secondaryColor: '#0a0f1a',
          tertiaryColor: '#05070d',
          noteBkgColor: '#0e1626',
          noteTextColor: '#8a97b2',
          noteBorderColor: '#2ee6ff',
          actorBkg: '#0e1626',
          actorBorder: '#2ee6ff',
          actorTextColor: '#dbe6f5',
          signalColor: '#8a97b2',
          signalTextColor: '#dbe6f5',
        },
        fontFamily: "'JetBrains Mono Variable', 'PingFang SC', 'Microsoft YaHei', monospace",
      })
      return mermaid
    })
  }
  return mermaidPromise
}

// 把容器内 .md-mermaid 下的 pre.mermaid 渲染为 SVG（幂等：跳过已处理的节点）
export async function renderMermaidIn(root: HTMLElement): Promise<void> {
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>('.md-mermaid > pre:not([data-processed])'),
  )
  if (nodes.length === 0) return

  const mermaid = await loadMermaid()
  try {
    await mermaid.run({ nodes, suppressErrors: true })
  } catch {
    // 语法错误的图保留原文展示，不影响其他内容
    for (const node of nodes) node.dataset.processed = 'true'
  }
}
