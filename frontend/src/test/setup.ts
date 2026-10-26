import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// 每个用例后卸载组件树，避免相邻用例相互污染
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
