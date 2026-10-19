import { useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api'
import { formatKcal, toDecimal } from '../../shared/format'
import { PlusIcon, PulseIcon, TrashIcon } from '../../shared/icons'
import { addActivity, deleteActivity, type Activity } from './api'

type Props = { date: string; activities: Activity[]; onChanged: () => void }

export function ActivityCard({ date, activities, onChanged }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setErrors({})
    try {
      await action()
      onChanged()
      return true
    } catch (err: unknown) {
      setErrors(err instanceof ApiError ? { form: err.message, ...err.fieldErrors } : { form: errorMessage(err) })
      return false
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await run(() => addActivity(date, name.trim(), toDecimal(kcal)))) {
      setName('')
      setKcal('')
      setAdding(false)
    }
  }

  return (
    <section className="card" aria-labelledby="activity-title">
      <div className="card__head">
        <h2 id="activity-title">Activités</h2>
        {!adding && (
          <button type="button" className="button button--ghost button--small" onClick={() => setAdding(true)}>
            <PlusIcon size={18} /> Ajouter
          </button>
        )}
      </div>
      {activities.length === 0 && !adding && <p className="muted">Aucune activité notée. Les calories brûlées s’ajoutent à votre budget du jour.</p>}
      {activities.length > 0 && (
        <ul className="activities">
          {activities.map((a) => (
            <li key={a.id} className="activity">
              <span className="activity__icon">
                <PulseIcon size={20} />
              </span>
              <span className="activity__name">{a.name}</span>
              <span className="entry__kcal">{formatKcal(a.kcal)} kcal</span>
              <button type="button" className="icon-button icon-button--plain" aria-label={`Supprimer ${a.name}`} disabled={busy} onClick={() => void run(() => deleteActivity(a.id))}>
                <TrashIcon size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <form className="activity-form" onSubmit={submit} noValidate>
          <label className="field">
            <span className="field__label">Activité</span>
            <input className="input" placeholder="ex. Course à pied" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} autoFocus />
          </label>
          <label className="field">
            <span className="field__label">Calories brûlées</span>
            <input className="input input--grams" inputMode="decimal" placeholder="ex. 350" value={kcal} onChange={(e) => setKcal(e.target.value)} aria-invalid={Boolean(errors.kcal)} />
          </label>
          {(errors.name ?? errors.kcal ?? errors.form) && (
            <p role="alert" className="field-error">
              {errors.name ?? errors.kcal ?? errors.form}
            </p>
          )}
          <div className="sheet__actions">
            <button type="button" className="button button--ghost" onClick={() => setAdding(false)}>
              Annuler
            </button>
            <button type="submit" className="button" disabled={busy || !name.trim() || !kcal.trim()}>
              Ajouter l’activité
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
