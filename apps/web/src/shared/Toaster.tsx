import { useEffect, useState } from 'react'
import { CheckIcon, CloseIcon } from './icons'
import { dismiss, useToasts, type Toast } from './toast'

const VISIBLE_MS = 5000

function ToastItem({ item }: { item: Toast }) {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const timer = setTimeout(() => dismiss(item.id), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [item.id, paused])

  return (
    <li
      className="toast"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="toast__icon" aria-hidden="true">
        <CheckIcon size={16} />
      </span>
      <span className="toast__message">{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            dismiss(item.id)
            void item.action?.run()
          }}
        >
          {item.action.label}
        </button>
      )}
      <button type="button" className="toast__close" aria-label="Fermer la notification" onClick={() => dismiss(item.id)}>
        <CloseIcon size={16} />
      </button>
    </li>
  )
}

/** Live region for confirmations; screen readers announce each new message politely. */
export function Toaster() {
  const items = useToasts()
  return (
    <div role="status" aria-live="polite" aria-label="Notifications">
      <ol className="toaster">
        {items.map((t) => (
          <ToastItem key={t.id} item={t} />
        ))}
      </ol>
    </div>
  )
}
