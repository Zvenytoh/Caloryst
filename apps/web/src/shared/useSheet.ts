import { useCallback, useEffect, useRef, type PointerEvent, type SyntheticEvent } from 'react'

const DISMISS_PX = 120
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Modal sheet behaviour on a native <dialog>: opens on mount, animates out on close
 * (button, Escape, backdrop click) and can be dragged down by its grabber to dismiss.
 */
export function useSheet(focusSelector?: string) {
  const ref = useRef<HTMLDialogElement>(null)
  const drag = useRef<{ startY: number; dy: number } | null>(null)

  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    // showModal() focuses the first control (the close button); move to the main field instead.
    if (focusSelector) dialog?.querySelector<HTMLElement>(focusSelector)?.focus()
  }, [focusSelector])

  const close = useCallback(() => {
    const dialog = ref.current
    if (!dialog?.open || dialog.dataset.closing) return
    dialog.dataset.closing = 'true'
    let done = false
    const finish = () => {
      if (done) return
      done = true
      dialog.close()
    }
    if (reducedMotion()) return finish()
    dialog.addEventListener('animationend', finish, { once: true })
    setTimeout(finish, 320)
  }, [])

  const dialogProps = {
    ref,
    onCancel: (e: SyntheticEvent) => {
      e.preventDefault()
      close()
    },
    onClick: (e: SyntheticEvent) => {
      // A click on the dialog element itself lands on the backdrop, outside the content.
      if (e.target === ref.current) close()
    },
  }

  const grabberProps = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      drag.current = { startY: e.clientY, dy: 0 }
      e.currentTarget.setPointerCapture(e.pointerId)
      if (ref.current) ref.current.style.transition = 'none'
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (!drag.current || !ref.current) return
      drag.current.dy = Math.max(0, e.clientY - drag.current.startY)
      ref.current.style.transform = `translateY(${drag.current.dy}px)`
    },
    onPointerUp: () => {
      const dialog = ref.current
      const dy = drag.current?.dy ?? 0
      drag.current = null
      if (!dialog) return
      dialog.style.transition = ''
      dialog.style.transform = ''
      if (dy > DISMISS_PX) close()
    },
  }

  return { dialogProps, grabberProps, close }
}
