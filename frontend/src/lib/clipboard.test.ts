import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

// 复制三条路径：异步 Clipboard API 成功 / 被拒后 execCommand 兜底 / 两者都失败。
// jsdom 默认没有 navigator.clipboard 与 document.execCommand，逐条注入
function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

function stubExecCommand(result: boolean) {
  const mock = vi.fn(() => result)
  Object.defineProperty(document, 'execCommand', { value: mock, configurable: true })
  return mock
}

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  Object.defineProperty(document, 'execCommand', { value: undefined, configurable: true })
})

describe('copyText', () => {
  it('Clipboard API 可用时直接写入，不走 execCommand', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    stubClipboard(writeText)
    const exec = stubExecCommand(true)

    await expect(copyText('const a = 1')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('const a = 1')
    expect(exec).not.toHaveBeenCalled()
  })

  it('Clipboard API 被拒时回退 execCommand 兜底成功', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')))
    const exec = stubExecCommand(true)

    await expect(copyText('fallback')).resolves.toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('Clipboard API 与 execCommand 都失败时返回 false，不抛异常', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')))
    stubExecCommand(false)

    await expect(copyText('nope')).resolves.toBe(false)
  })
})