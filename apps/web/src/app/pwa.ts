import { useEffect, useState } from 'react'

let waiting: ServiceWorker | null = null
const listeners = new Set<() => void>()

function setWaiting(worker: ServiceWorker | null) {
  waiting = worker
  listeners.forEach((l) => l())
}

/** Registers the public-shell service worker in production builds only. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', async () => {
    const reg = await navigator.serviceWorker.register('/sw.js').catch(() => null)
    if (!reg) return
    if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting)
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker)
      })
    })
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloading) {
        reloading = true
        window.location.reload()
      }
    })
  })
}

/** True when a new version is installed and waiting; `apply` activates it (user-initiated reload). */
export function useUpdate(): { available: boolean; apply: () => void } {
  const [available, setAvailable] = useState(waiting !== null)
  useEffect(() => {
    const listener = () => setAvailable(waiting !== null)
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }, [])
  return { available, apply: () => waiting?.postMessage('skip-waiting') }
}
