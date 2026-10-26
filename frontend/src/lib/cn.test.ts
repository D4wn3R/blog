import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn（clsx + tailwind-merge）', () => {
  it('条件类名：truthy 保留，falsy 剔除', () => {
    expect(cn('a', false && 'b', 'c', null, undefined)).toBe('a c')
  })

  it('同缀冲突类：后写者胜出（tailwind-merge 消解）', () => {
    expect(cn('border-edge', 'border-pulse/60')).toBe('border-pulse/60')
    expect(cn('px-3', 'px-1.5')).toBe('px-1.5')
  })

  it('非冲突类全部保留', () => {
    expect(cn('border border-edge px-3', 'text-xs')).toBe('border border-edge px-3 text-xs')
  })
})
