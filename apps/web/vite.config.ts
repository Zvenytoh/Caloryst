import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { mockApi } from './dev/mock-api.ts'
import { serviceWorker } from './dev/service-worker.ts'

export default defineConfig({
  plugins: [react(), mockApi(), serviceWorker()],
})
