import { describe, expect, it } from 'vitest'
import { isSubmitEnter } from './keyboard'

const evt = (overrides: Partial<Parameters<typeof isSubmitEnter>[0]> = {}) => ({
  key: 'Enter',
  shiftKey: false,
  nativeEvent: { isComposing: false, keyCode: 13 },
  ...overrides,
})

describe('isSubmitEnter', () => {
  it('Enter 触发提交', () => {
    expect(isSubmitEnter(evt())).toBe(true)
  })

  it('Shift+Enter 不触发', () => {
    expect(isSubmitEnter(evt({ shiftKey: true }))).toBe(false)
  })

  it('输入法组合态不触发', () => {
    expect(isSubmitEnter(evt({ nativeEvent: { isComposing: true, keyCode: 13 } }))).toBe(false)
  })

  it('keyCode 229（部分浏览器组合态）不触发', () => {
    expect(isSubmitEnter(evt({ nativeEvent: { isComposing: false, keyCode: 229 } }))).toBe(false)
  })

  it('其他按键不触发', () => {
    expect(isSubmitEnter(evt({ key: 'a' }))).toBe(false)
  })
})
