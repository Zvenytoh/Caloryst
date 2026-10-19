import { formatKcal, formatWhole } from '../../shared/format'
import type { Diary } from './api'

// Display-only ratios for gauges; every value shown as a number comes from the server.
const ratio = (value: string, goal: string) => (Number(goal) > 0 ? Math.min(1, Math.max(0, Number(value) / Number(goal))) : 0)

const MACROS = [
  { key: 'carbsG', label: 'Glucides', color: 'var(--carbs)' },
  { key: 'proteinG', label: 'Protéines', color: 'var(--protein)' },
  { key: 'fatG', label: 'Lipides', color: 'var(--fat)' },
] as const

// 270° gauge open at the bottom, like the Kalo mark.
const ARC = 'M 33.57 118.43 A 60 60 0 1 1 118.43 118.43'

export function Summary({ diary }: { diary: Diary }) {
  const over = Number(diary.remainingKcal) < 0
  return (
    <section className="card summary" aria-labelledby="summary-title">
      <h2 id="summary-title" className="visually-hidden">
        Résumé du jour
      </h2>
      <div className="summary__top">
        <p className="stat">
          <span className="stat__value">{formatWhole(diary.totals.kcal)}</span>
          <span className="stat__label">Mangées</span>
        </p>
        <div className="gauge">
          <svg viewBox="0 0 152 140" aria-hidden="true">
            <path d={ARC} className="gauge__track" pathLength={100} />
            {ratio(diary.totals.kcal, diary.goals.kcal) > 0 && (
            <path
              d={ARC}
              className={`gauge__value${over ? ' gauge__value--over' : ''}`}
              pathLength={100}
              strokeDasharray={`${ratio(diary.totals.kcal, diary.goals.kcal) * 100} 100`}
            />
            )}
          </svg>
          <p className="gauge__center">
            <span className="gauge__value-text">{formatWhole(over ? diary.remainingKcal.slice(1) : diary.remainingKcal)}</span>
            <span className="stat__label">{over ? 'En trop' : 'Restantes'}</span>
          </p>
        </div>
        <p className="stat">
          <span className="stat__value">{formatWhole(diary.burnedKcal)}</span>
          <span className="stat__label">Brûlées</span>
        </p>
      </div>
      <p className="muted summary__goal">Objectif {formatKcal(diary.goals.kcal)} kcal</p>
      <ul className="macros">
        {MACROS.map((m) => (
          <li key={m.key} className="macro">
            <span className="macro__label">{m.label}</span>
            <span className="bar" role="progressbar" aria-label={m.label} aria-valuemin={0} aria-valuemax={Number(diary.goals[m.key])} aria-valuenow={Number(diary.totals[m.key])}>
              <span className="bar__fill" style={{ inlineSize: `${ratio(diary.totals[m.key], diary.goals[m.key]) * 100}%`, background: m.color }} />
            </span>
            <span className="macro__value">
              {formatKcal(diary.totals[m.key])} / {formatKcal(diary.goals[m.key])} g
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
