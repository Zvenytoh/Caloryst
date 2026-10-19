import { useEffect, useRef, useState } from 'react'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Animates a displayed number from its previous value to `target` (display only; shorter with reduced motion). */
export function useCountUp(target: number, durationMs = 700): number {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  const duration = reducedMotion() ? Math.min(durationMs, 350) : durationMs

  useEffect(() => {
    const start = performance.now()
    const origin = from.current
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / duration)
      const value = origin + (target - origin) * (1 - (1 - t) ** 3)
      from.current = value
      setShown(value)
      if (t < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, duration])

  return shown
}
