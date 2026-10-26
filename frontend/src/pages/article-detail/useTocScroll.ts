import { useEffect, useState } from 'react'
import type { TocItem } from '../../lib/markdown'

// TOC 滚动高亮：rAF 节流（每帧至多一次测量），最后一个滚过阈值线的标题为当前章节
export function useTocScroll(toc: TocItem[]): string {
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    if (toc.length === 0) return
    let rafId = 0

    const measure = () => {
      let current = ''
      for (const item of toc) {
        const el = document.getElementById(item.id)
        if (el && el.getBoundingClientRect().top <= 128) current = item.id
      }
      setActiveId(current)
    }

    const onScroll = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        measure()
      })
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [toc])

  return activeId
}
