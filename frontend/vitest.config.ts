import { defineConfig } from 'vitest/config'

// 独立于 vite.config（避免构建配置耦合），jsdom 供 DOMPurify/localStorage 使用
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
