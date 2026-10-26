import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTocScroll } from './useTocScroll'
import type { TocItem } from '../../lib/markdown'

// TOC 滚动高亮 hook：阈值线（top ≤ 128）之下最后一个标题为当前章节。
// jsdom 无布局引擎，用 mock getBoundingClientRect 模拟标题位置
const toc: TocItem[] = [
  { id: 'intro', text: 'intro', level: 1 },
  { id: 'usage', text: 'usage', level: 2 },
]

function mountHeading(id: string, top: number) {
  const el = document.createElement('div')
  el.id = id
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom: top,
      height: 0,
      width: 0,
      left: 0,
      right: 0,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
  document.body.appendChild(el)
  return el
}

describe('useTocScroll', () => {
  it('空目录返回空串，不挂监听', () => {
    const { result, unmount } = renderHook(() => useTocScroll([]))
    expect(result.current).toBe('')
    unmount()
  })

  it('标题均未过阈值线时 activeId 为空串', () => {
    const el1 = mountHeading('intro', 300)
    const el2 = mountHeading('usage', 500)
    const { result, unmount } = renderHook(() => useTocScroll(toc))
    expect(result.current).toBe('')
    el1.remove()
    el2.remove()
    unmount()
  })

  it('滚动使标题过线后，scroll 事件驱动 activeId 更新为最后一个过线者', async () => {
    const el1 = mountHeading('intro', 100)
    const el2 = mountHeading('usage', 300)
    const { result, unmount } = renderHook(() => useTocScroll(toc))
    expect(result.current).toBe('intro')

    el2.getBoundingClientRect = () =>
      ({
        top: 50,
        bottom: 50,
        height: 0,
        width: 0,
        left: 0,
        right: 0,
        x: 0,
        y: 50,
        toJSON: () => ({}),
      }) as DOMRect
    // 滚动监听经 rAF 节流：dispatch 后等待一帧再断言
    await act(async () => {
      window.dispatchEvent(new Event('scroll'))
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    expect(result.current).toBe('usage')

    el1.remove()
    el2.remove()
    unmount()
  })
})
