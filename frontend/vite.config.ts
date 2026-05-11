import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => {
  const backendPort = process.env.BACKEND_PORT || '8000'
  const backendHttp = `http://127.0.0.1:${backendPort}`
  const backendWs = `ws://127.0.0.1:${backendPort}`

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': backendHttp,
        '/health': backendHttp,
        '/ws': { target: backendWs, ws: true, changeOrigin: true },
      },
    },
  }
})
