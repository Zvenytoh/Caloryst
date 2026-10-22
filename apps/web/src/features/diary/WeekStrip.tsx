import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { dayChip, formatDay, formatWhole, mondayOf, shiftDate, today } from '../../shared/format'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '../../shared/icons'
import { fetchWeek, type Week } from './api'

type Props = { date: string; version: number; onSelect: (date: string) => void }

const SWIPE_PX = 48

/** Monday–Sunday day picker; each day shows how much of the energy goal was eaten. */
export function WeekStrip({ date, version, onSelect }: Props) {
  const monday = mondayOf(date)
  const [week, setWeek] = useState<{ monday: string; data: Week } | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const swipe = useRef<number | null>(null)
  const now = today()

  useEffect(() => {
    const controller = new AbortController()
    fetchWeek(monday, controller.signal)
      .then((data) => setWeek({ monday, data }))
      // The strip is a navigation aid: without data it still works, just without rings.
      .catch(() => undefined)
    return () => controller.abort()
  }, [monday, version])

  const goal = Number(week?.data.goalKcal ?? 0)
  const kcalOf = (day: string) => (week?.monday === monday ? week.data.days.find((d) => d.date === day)?.kcal : undefined)
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i))

  const onPointerDown = (e: PointerEvent) => {
    swipe.current = e.clientX
  }
  const onPointerUp = (e: PointerEvent) => {
    if (swipe.current === null) return
    const dx = e.clientX - swipe.current
    swipe.current = null
    if (Math.abs(dx) > SWIPE_PX) onSelect(shiftDate(date, dx < 0 ? 7 : -7))
  }

  return (
    <nav className="week" aria-label="Choisir le jour">
      <button type="button" className="icon-button icon-button--plain" aria-label="Semaine précédente" onClick={() => onSelect(shiftDate(date, -7))}>
        <ChevronLeftIcon size={20} />
      </button>
      <ol className="week__days" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (swipe.current = null)}>
        {days.map((day) => {
          const { initial, day: n } = dayChip(day)
          const kcal = kcalOf(day)
          const progress = goal > 0 && kcal ? Math.min(1, Number(kcal) / goal) : 0
          const label = `${formatDay(day)}${kcal ? `, ${formatWhole(kcal)} kcal sur ${formatWhole(String(goal))}` : ''}`
          return (
            <li key={day}>
              <button
                type="button"
                className={`week__day${day === now ? ' week__day--today' : ''}`}
                aria-pressed={day === date}
                onClick={() => onSelect(day)}
              >
                <span className="visually-hidden">{label}</span>
                <span className="week__initial" aria-hidden="true">
                  {initial}
                </span>
                <span className="week__ring" aria-hidden="true">
                  <svg viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" className="week__track" />
                    {progress > 0 && (
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        className={`week__value${Number(kcal) > goal * 1.05 ? ' week__value--over' : ''}`}
                        pathLength={100}
                        strokeDasharray="100 100"
                        strokeDashoffset={100 - progress * 100}
                      />
                    )}
                  </svg>
                  <span className="week__number" aria-hidden="true">
                    {n}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <button type="button" className="icon-button icon-button--plain" aria-label="Semaine suivante" onClick={() => onSelect(shiftDate(date, 7))}>
        <ChevronRightIcon size={20} />
      </button>
      <label className="week__calendar icon-button icon-button--plain">
        <CalendarIcon size={20} />
        <span className="visually-hidden">Aller à une date</span>
        <input
          ref={picker}
          type="date"
          value={date}
          onChange={(e) => e.target.value && onSelect(e.target.value)}
          onClick={() => {
            try {
              picker.current?.showPicker()
            } catch {
              // showPicker() is unsupported or blocked: the native input still opens on focus.
            }
          }}
        />
      </label>
    </nav>
  )
}
