import { useSyncExternalStore } from 'react'

export type Toast = {
  id: number
  message: string
  action?: { label: string; run: () => void | Promise<void> }
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

/** Shows a short confirmation; at most three stay visible. Returns its id. */
export function toast(message: string, action?: Toast['action']): number {
  const id = nextId++
  toasts = [...toasts.slice(-2), action ? { id, message, action } : { id, message }]
  emit()
  return id
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    () => toasts,
  )
}

/** A short vibration where supported (Android); silently ignored elsewhere. */
export function tap(ms = 12) {
  if ('vibrate' in navigator) navigator.vibrate(ms)
}
