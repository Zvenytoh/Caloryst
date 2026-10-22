import { useEffect, useState } from 'react'
import { ApiError, errorMessage } from '../../shared/api'
import { formatDay, relativeDay, today } from '../../shared/format'
import { ActivityCard } from './ActivityCard'
import { AddEntryDialog } from './AddEntryDialog'
import { fetchDiary, type Diary, type Meal } from './api'
import { MealCard } from './MealCard'
import { Summary } from './Summary'
import { WaterCard } from './WaterCard'
import { WeekStrip } from './WeekStrip'

type Props = { onUnauthenticated: () => void }

export function DiaryPage({ onUnauthenticated }: Props) {
  const [date, setDate] = useState(today)
  const [diary, setDiary] = useState<Diary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [addingTo, setAddingTo] = useState<Meal | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchDiary(date, controller.signal)
      .then((d) => {
        setDiary(d)
        setError(null)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (err instanceof ApiError && err.status === 401) return onUnauthenticated()
        setError(errorMessage(err))
      })
    // Aborting prevents a slow response from replacing the newly selected day.
    return () => controller.abort()
  }, [date, version, onUnauthenticated])

  const refresh = () => setVersion((v) => v + 1)
  const shown = diary?.date === date ? diary : null
  const isToday = date === today()

  return (
    <div className="diary">
      <header className="day-head">
        <div>
          <h1 className="day-head__title">{isToday ? 'Aujourd’hui' : formatDay(date)}</h1>
          <p className="muted">{isToday ? formatDay(date) : relativeDay(date)}</p>
        </div>
        {!isToday && (
          <button type="button" className="button button--ghost button--small" onClick={() => setDate(today())}>
            Revenir à aujourd’hui
          </button>
        )}
      </header>
      <WeekStrip date={date} version={version} onSelect={setDate} />

      {error && (
        <div role="alert" className="notice notice--error">
          <span>{error}</span>
          <button type="button" className="button button--small" onClick={refresh}>
            Réessayer
          </button>
        </div>
      )}

      {!shown && !error && (
        <div className="dashboard" aria-busy="true" aria-label="Chargement du journal">
          <div className="skeleton skeleton--summary" />
          <div className="skeleton" />
        </div>
      )}

      {shown && (
        <div className="dashboard">
          <div className="dashboard__main">
            <Summary diary={shown} />
            <section aria-labelledby="meals-title" className="section">
              <h2 id="meals-title" className="section__title">
                Alimentation
              </h2>
              <ul className="card meals">
                {shown.meals.map((day) => (
                  <MealCard key={day.meal} day={day} onAdd={() => setAddingTo(day.meal)} onChanged={refresh} />
                ))}
              </ul>
            </section>
          </div>
          <div className="dashboard__side">
            <WaterCard date={date} waterMl={shown.waterMl} goalMl={shown.goals.waterMl} onChanged={refresh} />
            <ActivityCard date={date} activities={shown.activities} onChanged={refresh} />
          </div>
        </div>
      )}

      {addingTo && <AddEntryDialog date={date} meal={addingTo} onClose={() => setAddingTo(null)} onAdded={refresh} />}
    </div>
  )
}
