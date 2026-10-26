import { useLayoutEffect } from 'react'
import type { DependencyList } from 'react'
import { useReducedMotion } from 'motion/react'

interface Revertible {
  revert(): void
}

// anime.js 入场动效统一入口：
// - prefers-reduced-motion 用户直接跳过，保持静态渲染
// - useLayoutEffect 保证动画在首帧绘制前注册，避免内容先闪现再入场
// - cleanup 调 revert() 撤销 anime 写入的内联样式，StrictMode 双调用与路由卸载均安全
export function useEntrance(build: () => Revertible | undefined, deps: DependencyList = []) {
  const reduce = useReducedMotion()
  useLayoutEffect(() => {
    if (reduce) return
    const anim = build()
    return () => {
      anim?.revert()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps 由调用方显式给出
  }, [reduce, ...deps])
}
