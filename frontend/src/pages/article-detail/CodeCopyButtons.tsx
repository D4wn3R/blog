import { useEffect, useRef } from 'react'
import { Check, Copy, X } from '@phosphor-icons/react'
import { copyText } from '../../lib/clipboard'

// 代码块复制按钮：markdown 输出的是静态 HTML，React 无法在被 dangerouslySetInnerHTML
// 覆盖的子树里渲染组件，故由本组件在 HTML 注入后把按钮挂进每个 .md-code-block。
//
// 图标用 Phosphor 组件本体渲染进隐藏容器，再克隆 SVG 节点——既保持与全站一致的
// 图标风格，又不需要为一次 DOM 注入引入 react-dom/server。
const _stateResetMs = 1200

// _buttonStates 按钮三态与对应图标类名的映射（图标顺序与隐藏模板一致）
const _buttonStates = ['idle', 'ok', 'fail'] as const
type CopyState = (typeof _buttonStates)[number]

const _labels: Record<CopyState, string> = {
  idle: '复制代码',
  ok: '已复制',
  fail: '复制失败',
}

interface Props {
  // contentRef 指向文章正文容器（dangerouslySetInnerHTML 的宿主）
  contentRef: React.RefObject<HTMLDivElement | null>
  // html 变化代表整块正文被替换，需要重新挂按钮（避免叠加与失效引用）
  html: string
}

export function CodeCopyButtons({ contentRef, html }: Props) {
  const iconsRef = useRef<HTMLDivElement>(null)
  const timersRef = useRef<Set<number>>(new Set())

  // 挂按钮：每个普通代码块一个，已挂过则跳过（幂等，防重复）
  useEffect(() => {
    const container = contentRef.current
    const icons = iconsRef.current
    if (!container || !icons) return
    const templates = Array.from(icons.querySelectorAll('svg'))
    if (templates.length === 0) return

    for (const block of container.querySelectorAll<HTMLElement>('.md-code-block')) {
      if (block.querySelector('.md-code-copy')) continue
      if (!block.querySelector('pre')) continue

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'md-code-copy'
      button.dataset.state = 'idle'
      button.setAttribute('aria-label', _labels.idle)
      button.title = _labels.idle
      for (const [i, state] of _buttonStates.entries()) {
        const icon = templates[i]
        if (!icon) continue
        const holder = document.createElement('span')
        holder.className = `md-copy-icon md-copy-icon--${state}`
        holder.appendChild(icon.cloneNode(true))
        button.appendChild(holder)
      }
      block.appendChild(button)
    }
  }, [contentRef, html])

  // 事件委托：容器只有一个监听器，动态追加的按钮也能命中；
  // 点击不冒泡（正文里可能有链接/外层卡片），复制失败只改按钮状态
  useEffect(() => {
    const container = contentRef.current
    if (!container) return

    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest<HTMLButtonElement>('.md-code-copy')
      if (!button) return
      event.preventDefault()
      event.stopPropagation()

      // fence 原文末尾带一个换行（markdown-it token 约定）：复制时去掉，粘贴不会多出空行
      const code = (button.parentElement?.querySelector('pre')?.textContent ?? '').replace(/\n$/, '')
      void copyText(code).then((ok) => {
        const state: CopyState = ok ? 'ok' : 'fail'
        button.dataset.state = state
        button.setAttribute('aria-label', _labels[state])
        button.title = _labels[state]

        const timer = window.setTimeout(() => {
          button.dataset.state = 'idle'
          button.setAttribute('aria-label', _labels.idle)
          button.title = _labels.idle
          timersRef.current.delete(timer)
        }, _stateResetMs)
        timersRef.current.add(timer)
      })
    }

    container.addEventListener('click', onClick)
    return () => container.removeEventListener('click', onClick)
  }, [contentRef])

  // 卸载清理所有状态复位定时器
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
      timers.clear()
    }
  }, [])

  return (
    <div ref={iconsRef} className="hidden" aria-hidden="true">
      <Copy size={13} weight="bold" />
      <Check size={13} weight="bold" />
      <X size={13} weight="bold" />
    </div>
  )
}