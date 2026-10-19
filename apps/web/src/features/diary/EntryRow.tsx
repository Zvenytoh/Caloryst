import { useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api'
import { formatGrams, formatKcal, toDecimal } from '../../shared/format'
import { deleteEntry, updateEntry, type Entry } from './api'

type Props = { entry: Entry; share: number; onChanged: () => void }
type Mode = 'view' | 'edit' | 'confirm-delete'

export function EntryRow({ entry, share, onChanged }: Props) {
  const [mode, setMode] = useState<Mode>('view')
  const [grams, setGrams] = useState(entry.grams)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      setMode('view')
      onChanged()
    } catch (err: unknown) {
      setError(err instanceof ApiError ? (err.fieldErrors.grams ?? err.message) : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault()
    void run(() => updateEntry(entry.id, toDecimal(grams)))
  }

  const edit = () => {
    setGrams(entry.grams)
    setMode('edit')
  }

  const inputId = `grams-${entry.id}`
  return (
    <li className="entry">
      {mode === 'edit' ? (
        <form className="entry__edit" onSubmit={save}>
          <label htmlFor={inputId}>
            {entry.foodName} <span className="muted">· portion en grammes</span>
          </label>
          <div className="entry__actions">
            <input
              id={inputId}
              className="input input--grams"
              inputMode="decimal"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              autoFocus
              required
            />
            <button type="submit" className="button button--small" disabled={busy}>
              Enregistrer
            </button>
            <button type="button" className="button button--ghost button--small" onClick={() => setMode('view')}>
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="entry__main">
            <span className="entry__name">{entry.foodName}</span>
            <span className="muted entry__meta">
              {formatGrams(entry.grams)} g · {formatKcal(entry.kcalPer100g)} kcal/100 g
            </span>
            <span className="entry__bar" style={{ inlineSize: `${Math.round(share * 100)}%` }} aria-hidden="true" />
          </div>
          <span className="entry__kcal">
            {formatKcal(entry.kcal)} <span className="muted">kcal</span>
          </span>
          <div className="entry__actions">
            {mode === 'confirm-delete' ? (
              <>
                <button
                  type="button"
                  className="button button--danger button--small"
                  disabled={busy}
                  onClick={() => void run(() => deleteEntry(entry.id))}
                >
                  Confirmer la suppression
                </button>
                <button type="button" className="button button--ghost button--small" onClick={() => setMode('view')}>
                  Garder
                </button>
              </>
            ) : (
              <>
                <button type="button" className="button button--ghost button--small" aria-label={`Modifier ${entry.foodName}`} onClick={edit}>
                  Modifier
                </button>
                <button
                  type="button"
                  className="button button--ghost button--small"
                  aria-label={`Supprimer ${entry.foodName}`}
                  onClick={() => setMode('confirm-delete')}
                >
                  Supprimer
                </button>
              </>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="field-error entry__error">
          {error}
        </p>
      )}
    </li>
  )
}
