import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { mockApi } from './dev/mock-api.ts'
import { serviceWorker } from './dev/service-worker.ts'

// KALO_API_URL=http://localhost:8080 proxies /api to the Rust API; otherwise the in-memory mock answers.
const api = process.env.KALO_API_URL

export default defineConfig({
  plugins: [react(), ...(api ? [] : [mockApi()]), serviceWorker()],
  server: api ? { proxy: { '/api': api } } : {},
  preview: api ? { proxy: { '/api': api } } : {},
})
