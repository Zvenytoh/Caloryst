import type { ReactNode } from 'react'
import { formatKcal } from '../../shared/format'
import { LeafIcon, MoonIcon, PlusIcon, SunIcon, SunriseIcon } from '../../shared/icons'
import { MEAL_LABEL, type Meal, type MealDay } from './api'
import { EntryRow } from './EntryRow'

const MEAL_ICON: Record<Meal, ReactNode> = {
  breakfast: <SunriseIcon />,
  lunch: <SunIcon />,
  dinner: <MoonIcon />,
  snack: <LeafIcon />,
}

type Props = { day: MealDay; onAdd: () => void; onChanged: () => void }

export function MealCard({ day, onAdd, onChanged }: Props) {
  const target = Number(day.targetKcal)
  const progress = target > 0 ? Math.min(1, Number(day.kcal) / target) : 0
  const label = MEAL_LABEL[day.meal]
  return (
    <li className="meal">
      <div className="meal__head">
        <span className="meal__icon">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="21" className="ring__track" />
            {progress > 0 && <circle cx="24" cy="24" r="21" className="ring__value" pathLength={100} strokeDasharray={`${progress * 100} 100`} />}
          </svg>
          {MEAL_ICON[day.meal]}
        </span>
        <div className="meal__text">
          <h3>{label}</h3>
          <p className="muted">
            {formatKcal(day.kcal)} / {formatKcal(day.targetKcal)} kcal
          </p>
        </div>
        <button type="button" className="round-button" aria-label={`Ajouter une portion : ${label}`} onClick={onAdd}>
          <PlusIcon />
        </button>
      </div>
      {day.entries.length > 0 && (
        <ul className="meal__entries">
          {day.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </li>
  )
}
