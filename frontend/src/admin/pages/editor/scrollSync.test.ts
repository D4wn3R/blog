import { describe, expect, it } from 'vitest'
import { bindScrollSync, scrollRatio, type ScrollTarget } from './scrollSync'

// 模拟滚动容器：程序写入不派发事件，emit() 用来模拟浏览器异步送达的 scroll 事件
class FakeScroller implements ScrollTarget {
  scrollTop = 0
  scrollHeight: number
  clientHeight: number
  private readonly listeners = new Set<() => void>()

  constructor(scrollHeight: number, clientHeight: number) {
    this.scrollHeight = scrollHeight
    this.clientHeight = clientHeight
  }

  addEventListener(_type: 'scroll', listener: () => void) {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'scroll', listener: () => void) {
    this.listeners.delete(listener)
  }

  get listenerCount() {
    return this.listeners.size
  }

  /** 用户滚动：写入位置并同步派发 scroll */
  userScroll(top: number) {
    this.scrollTop = top
    this.emit()
  }

  emit() {
    for (const listener of [...this.listeners]) listener()
  }
}

describe('scrollRatio', () => {
  const tests = [
    { give: '中间位置', scrollTop: 400, scrollHeight: 1000, clientHeight: 200, want: 0.5 },
    { give: '超出可滚动区间', scrollTop: 900, scrollHeight: 1000, clientHeight: 200, want: 1 },
    { give: '负偏移', scrollTop: -20, scrollHeight: 1000, clientHeight: 200, want: 0 },
    { give: '恰好一屏', scrollTop: 0, scrollHeight: 200, clientHeight: 200, want: 0 },
    { give: '内容不足一屏', scrollTop: 0, scrollHeight: 100, clientHeight: 200, want: 0 },
  ]

  for (const tt of tests) {
    it(tt.give, () => {
      expect(scrollRatio(tt)).toBe(tt.want)
    })
  }
})

describe('bindScrollSync', () => {
  it('编辑区滚动带动预览区等比例跟随', () => {
    const editor = new FakeScroller(1000, 200)
    const preview = new FakeScroller(1000, 200)
    bindScrollSync(editor, preview)

    editor.userScroll(400)

    expect(scrollRatio(preview)).toBe(0.5)
  })

  it('预览区滚动反向带动编辑区', () => {
    const editor = new FakeScroller(1000, 200)
    const preview = new FakeScroller(1000, 200)
    bindScrollSync(editor, preview)

    preview.userScroll(200)

    expect(scrollRatio(editor)).toBe(0.25)
  })

  it('程序写入引发的 scroll 事件被吞掉，不反向回灌', () => {
    const editor = new FakeScroller(1000, 200)
    const preview = new FakeScroller(1000, 200)
    bindScrollSync(editor, preview)

    editor.userScroll(400)
    preview.emit() // 浏览器对程序写入 scrollTop 的异步 scroll 事件

    expect(editor.scrollTop).toBe(400)
    expect(preview.scrollTop).toBe(400)
  })

  it('程序滚动事件位置偏离期望值时视为用户滚动', () => {
    const editor = new FakeScroller(1000, 200)
    const preview = new FakeScroller(1000, 200)
    bindScrollSync(editor, preview)

    editor.userScroll(400)
    expect(preview.scrollTop).toBe(400)

    // 平滑动画中间态或被夹取的 scroll 事件：位置与期望不符 → 抢回主动侧
    preview.scrollTop = 100
    preview.emit()

    expect(editor.scrollTop).toBe(100) // preview 比例 0.125 回写编辑区
  })

  it('跟随侧不可滚动时跳过，不产生 NaN', () => {
    const editor = new FakeScroller(1000, 200)
    const preview = new FakeScroller(200, 200)
    bindScrollSync(editor, preview)

    editor.userScroll(400)

    expect(preview.scrollTop).toBe(0)
  })

  it('内容高度变化后按主动侧重算跟随侧比例', () => {
    const editor = new FakeScroller(1000, 200)
    const preview = new FakeScroller(1000, 200)
    const sync = bindScrollSync(editor, preview)

    editor.userScroll(400) // 比例 0.5
    preview.scrollHeight = 2000 // 预览补渲染 / mermaid / 图片加载
    sync.resync()

    expect(preview.scrollTop).toBe(900) // 0.5 * (2000 - 200)
  })

  it('主动侧跟随最近一次用户滚动的一侧', () => {
    const editor = new FakeScroller(1000, 200)
    const preview = new FakeScroller(1000, 200)
    const sync = bindScrollSync(editor, preview)

    preview.userScroll(600) // 比例 0.75，主动侧切到预览
    editor.scrollHeight = 2000
    sync.resync()

    expect(editor.scrollTop).toBe(1350) // 0.75 * (2000 - 200)
  })

  it('dispose 后移除滚动监听', () => {
    const editor = new FakeScroller(1000, 200)
    const preview = new FakeScroller(1000, 200)
    const sync = bindScrollSync(editor, preview)
    sync.dispose()

    editor.userScroll(400)

    expect(editor.listenerCount).toBe(0)
    expect(preview.listenerCount).toBe(0)
    expect(preview.scrollTop).toBe(0)
  })
})
