import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { serviceWorker } from './dev/service-worker.ts'

// The dev server forwards /api to the Rust API (apps/api); override with KALO_API_URL.
// 127.0.0.1, not localhost: on Windows localhost tries IPv6 first and adds ~200 ms per call.
const api = process.env.KALO_API_URL ?? 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: { proxy: { '/api': api } },
  preview: { proxy: { '/api': api } },
  test: { environment: 'jsdom' },
})
