import { useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api'
import { toDecimal } from '../../shared/format'
import { createFood, type Food } from './api'

type Props = { initialName: string; onCreated: (food: Food) => void; onCancel: () => void }

export function NewFoodForm({ initialName, onCreated, onCancel }: Props) {
  const [name, setName] = useState(initialName)
  const [kcal, setKcal] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      onCreated(await createFood(name.trim(), toDecimal(kcal)))
    } catch (err: unknown) {
      setErrors(err instanceof ApiError ? { form: err.message, ...err.fieldErrors } : { form: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="sheet__body" onSubmit={submit} noValidate>
      <p className="muted">Les valeurs se trouvent sur l’emballage, colonne « pour 100 g ».</p>
      <label className="field">
        <span className="field__label">Nom de l’aliment</span>
        <input
          className="input"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'name-error' : undefined}
          autoFocus
          required
        />
      </label>
      {errors.name && (
        <p id="name-error" role="alert" className="field-error">
          {errors.name}
        </p>
      )}
      <label className="field">
        <span className="field__label">Énergie (kcal pour 100 g)</span>
        <input
          className="input input--grams"
          inputMode="decimal"
          placeholder="ex. 372"
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          aria-invalid={Boolean(errors.kcalPer100g)}
          aria-describedby={errors.kcalPer100g ? 'kcal-error' : undefined}
          required
        />
      </label>
      {errors.kcalPer100g && (
        <p id="kcal-error" role="alert" className="field-error">
          {errors.kcalPer100g}
        </p>
      )}
      {errors.form && !errors.name && !errors.kcalPer100g && (
        <p role="alert" className="field-error">
          {errors.form}
        </p>
      )}
      <div className="sheet__actions">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Retour
        </button>
        <button type="submit" className="button" disabled={busy || !name.trim() || !kcal.trim()}>
          {busy ? 'Création…' : 'Créer l’aliment'}
        </button>
      </div>
    </form>
  )
}
