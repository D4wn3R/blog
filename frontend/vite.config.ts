import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      // RSS 订阅源（后端生成 XML）
      '/feed.xml': 'http://127.0.0.1:8080',
      // /files/{object} 重写到公开桶 /blog/{object}
      '/files': {
        target: 'http://127.0.0.1:9000',
        rewrite: (path) => path.replace(/^\/files/, '/blog'),
      },
    },
  },
})
