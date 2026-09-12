import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
// 從 vitest/config 匯入才認得 test 這個區塊；vite 自己的 defineConfig 不認得。
import { defineConfig } from 'vitest/config'

// 容器裡跑的時候才需要這些設定，原生開發完全不受影響。
const inDocker = process.env.VITE_DOCKER === '1'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    // 這個套件被 esbuild 預打包會炸 "TypeError: isObject is not a function"。
    // 不要手癢拿掉這一行。
    exclude: ['@ant-design/icons-vue'],
  },
  server: {
    port: {{frontend_port}},
    strictPort: true,
    host: inDocker ? '0.0.0.0' : undefined,
    watch: inDocker ? { usePolling: true } : undefined,
    proxy: {
      // 前端一律打 /api，由 dev server 轉給後端，所以不需要處理 CORS。
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:{{backend_port}}',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'happy-dom',
  },
})
