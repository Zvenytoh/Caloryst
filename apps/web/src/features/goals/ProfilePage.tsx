import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api'
import { toDecimal } from '../../shared/format'
import type { Goals } from '../diary/api'
import { fetchGoals, saveGoals } from './api'

const FIELDS: { key: keyof Goals; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Énergie', unit: 'kcal' },
  { key: 'carbsG', label: 'Glucides', unit: 'g' },
  { key: 'proteinG', label: 'Protéines', unit: 'g' },
  { key: 'fatG', label: 'Lipides', unit: 'g' },
  { key: 'waterMl', label: 'Eau', unit: 'ml' },
]

type Props = { displayName: string; onSignOut: () => void }

export function ProfilePage({ displayName, onSignOut }: Props) {
  const [goals, setGoals] = useState<Goals | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const controller = new AbortController()
    fetchGoals(controller.signal)
      .then(setGoals)
      .catch((err: unknown) => !controller.signal.aborted && setErrors({ form: errorMessage(err) }))
    return () => controller.abort()
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!goals) return
    setBusy(true)
    setErrors({})
    setSaved(false)
    try {
      const normalized = Object.fromEntries(Object.entries(goals).map(([k, v]) => [k, toDecimal(v)])) as Goals
      setGoals(await saveGoals(normalized))
      setSaved(true)
    } catch (err: unknown) {
      setErrors(err instanceof ApiError ? { form: err.message, ...err.fieldErrors } : { form: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-body">
      <header className="day-head">
        <div>
          <h1 className="day-head__title">Profil</h1>
          <p className="muted">Connecté en tant que {displayName}</p>
        </div>
        <button type="button" className="button button--ghost button--small" onClick={onSignOut}>
          Se déconnecter
        </button>
      </header>
      <section className="card goals" aria-labelledby="goals-title">
        <h2 id="goals-title" className="card__title">
          Objectifs quotidiens
        </h2>
        {!goals && !errors.form && <div className="skeleton" aria-busy="true" aria-label="Chargement des objectifs" />}
        {goals && (
          <form className="goals__form" onSubmit={submit} noValidate>
            {FIELDS.map((f) => (
              <label key={f.key} className="field">
                <span className="field__label">
                  {f.label} ({f.unit})
                </span>
                <input
                  className="input"
                  inputMode="decimal"
                  value={goals[f.key]}
                  onChange={(e) => setGoals({ ...goals, [f.key]: e.target.value })}
                  aria-invalid={Boolean(errors[f.key])}
                  aria-describedby={errors[f.key] ? `${f.key}-error` : undefined}
                />
                {errors[f.key] && (
                  <span id={`${f.key}-error`} className="field-error">
                    {errors[f.key]}
                  </span>
                )}
              </label>
            ))}
            <div className="goals__actions">
              {saved && (
                <p role="status" className="muted">
                  Objectifs enregistrés.
                </p>
              )}
              <button type="submit" className="button" disabled={busy}>
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        )}
        {errors.form && (
          <p role="alert" className="field-error">
            {errors.form}
          </p>
        )}
      </section>
    </div>
  )
}
