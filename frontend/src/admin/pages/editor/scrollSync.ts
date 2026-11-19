// 分屏滚动同步：按可滚动比例（0..1）双向映射。
// 预览会因防抖重渲染 / mermaid 异步补渲染 / 图片加载改变高度，所以内容高度变化时
// 按「主动侧」重算跟随侧；程序写入 scrollTop 引发的 scroll 事件靠期望值吞掉，
// 避免两侧互相触发形成回环抖动。

export interface ScrollTarget {
  scrollTop: number
  readonly scrollHeight: number
  readonly clientHeight: number
  addEventListener(type: 'scroll', listener: () => void): void
  removeEventListener(type: 'scroll', listener: () => void): void
}

/** 可滚动比例 0..1；内容不足一屏返回 0 */
export function scrollRatio(
  el: Pick<ScrollTarget, 'scrollTop' | 'scrollHeight' | 'clientHeight'>,
): number {
  const max = el.scrollHeight - el.clientHeight
  if (max <= 0) return 0
  return Math.min(1, Math.max(0, el.scrollTop / max))
}

export interface ScrollSyncOptions {
  /** 初始与高度变化时的主动侧，默认 'a'（编辑区） */
  active?: 'a' | 'b'
  /** 额外观察高度变化的内容容器（滚动容器自身尺寸始终观察） */
  extraTargets?: Element[]
}

export interface ScrollSyncHandle {
  /** 内容高度变化后按主动侧比例重算跟随侧 */
  resync: () => void
  dispose: () => void
}

/** 以 1px 容差判定是否为目标侧刚被程序写入的位置 */
const _tolerance = 1

export function bindScrollSync(
  a: ScrollTarget,
  b: ScrollTarget,
  options: ScrollSyncOptions = {},
): ScrollSyncHandle {
  const expected = new Map<ScrollTarget, number>()
  let active: ScrollTarget = options.active === 'b' ? b : a
  let disposed = false

  const applyRatio = (target: ScrollTarget, ratio: number) => {
    const max = target.scrollHeight - target.clientHeight
    if (max <= 0) return
    const next = Math.round(ratio * max)
    if (Math.abs(target.scrollTop - next) <= _tolerance) return
    expected.set(target, next)
    target.scrollTop = next
  }

  const syncFrom = (source: ScrollTarget) => {
    applyRatio(source === a ? b : a, scrollRatio(source))
  }

  const handlers = new Map<ScrollTarget, () => void>()
  for (const el of [a, b]) {
    const handler = () => {
      if (disposed) return
      const want = expected.get(el)
      if (want !== undefined) {
        expected.delete(el)
        // 程序滚动的异步 scroll 事件：位置即我们写入的值，忽略
        if (Math.abs(el.scrollTop - want) <= _tolerance) return
      }
      active = el
      syncFrom(el)
    }
    handlers.set(el, handler)
    el.addEventListener('scroll', handler)
  }

  const resync = () => {
    if (disposed) return
    syncFrom(active)
  }

  const observed = [a, b, ...(options.extraTargets ?? [])].filter(
    (el): el is Element => el instanceof Element,
  )
  const ro =
    typeof ResizeObserver === 'undefined' || observed.length === 0
      ? null
      : new ResizeObserver(resync)
  for (const el of observed) ro?.observe(el)

  return {
    resync,
    dispose: () => {
      disposed = true
      for (const [el, handler] of handlers) el.removeEventListener('scroll', handler)
      ro?.disconnect()
    },
  }
}
