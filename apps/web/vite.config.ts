import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { serviceWorker } from './dev/service-worker.ts'

// The dev server forwards /api to the Rust API (apps/api); override with KALO_API_URL.
const api = process.env.KALO_API_URL ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: { proxy: { '/api': api } },
  preview: { proxy: { '/api': api } },
  test: { environment: 'jsdom' },
})
