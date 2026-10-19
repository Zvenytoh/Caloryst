import { useEffect, useState } from 'react'
import { ApiError, errorMessage } from '../../shared/api'
import { formatDay, formatKcal, shiftDate, today } from '../../shared/format'
import { Logo } from '../../shared/Logo'
import { AddEntryDialog } from './AddEntryDialog'
import { fetchDiary, type Diary } from './api'
import { EntryRow } from './EntryRow'

type Props = { displayName: string; onSignOut: () => void; onUnauthenticated: () => void }

export function DiaryPage({ displayName, onSignOut, onUnauthenticated }: Props) {
  const [date, setDate] = useState(today)
  const [diary, setDiary] = useState<Diary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [adding, setAdding] = useState(false)

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
  const maxKcal = Math.max(1, ...(shown?.entries.map((e) => Number(e.kcal)) ?? []))
  const count = shown?.entries.length ?? 0

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span>Caloryst</span>
        </div>
        <div className="topbar__user">
          <span className="muted">{displayName}</span>
          <button type="button" className="button button--ghost button--small" onClick={onSignOut}>
            Se déconnecter
          </button>
        </div>
      </header>

      <main className="diary">
        <nav className="daynav" aria-label="Choisir le jour">
          <button type="button" className="icon-button" aria-label="Jour précédent" onClick={() => setDate((d) => shiftDate(d, -1))}>
            ‹
          </button>
          <label className="daynav__label">
            <span className="visually-hidden">Date du journal</span>
            <span aria-hidden="true">{isToday ? 'Aujourd’hui' : formatDay(date)}</span>
            <input type="date" value={date} required onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <button type="button" className="icon-button" aria-label="Jour suivant" onClick={() => setDate((d) => shiftDate(d, 1))}>
            ›
          </button>
          {!isToday && (
            <button type="button" className="button button--ghost button--small" onClick={() => setDate(today())}>
              Revenir à aujourd’hui
            </button>
          )}
        </nav>

        <section className="summary" aria-labelledby="summary-title" aria-busy={!shown}>
          <h1 id="summary-title" className="summary__day">
            {formatDay(date)}
          </h1>
          <p className="summary__total">
            <span className="summary__value">{shown ? formatKcal(shown.totalKcal) : '—'}</span>
            <span className="summary__unit">kcal</span>
          </p>
          <p className="muted">{shown ? `${count} ${count > 1 ? 'portions notées' : 'portion notée'}` : 'Chargement du journal…'}</p>
        </section>

        {error && (
          <div role="alert" className="notice notice--error">
            <span>{error}</span>
            <button type="button" className="button button--small" onClick={refresh}>
              Réessayer
            </button>
          </div>
        )}

        <section aria-labelledby="entries-title" className="entries">
          <div className="entries__head">
            <h2 id="entries-title">Journal</h2>
            <button type="button" className="button entries__add" onClick={() => setAdding(true)}>
              + Ajouter
            </button>
          </div>
          {!shown && !error && (
            <ul className="entry-list" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="skeleton" />
              ))}
            </ul>
          )}
          {shown && count === 0 && (
            <div className="empty" role="status">
              <p className="empty__title">Rien de noté pour ce jour.</p>
              <p className="muted">Un aliment, une portion en grammes : c’est tout ce qu’il faut.</p>
              <button type="button" className="button" onClick={() => setAdding(true)}>
                Ajouter une portion
              </button>
            </div>
          )}
          {shown && count > 0 && (
            <ul className="entry-list">
              {shown.entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} share={Number(entry.kcal) / maxKcal} onChanged={refresh} />
              ))}
            </ul>
          )}
        </section>
      </main>

      <button type="button" className="fab" aria-label="Ajouter une portion" onClick={() => setAdding(true)}>
        +
      </button>
      {adding && <AddEntryDialog date={date} onClose={() => setAdding(false)} onAdded={refresh} />}
    </div>
  )
}
