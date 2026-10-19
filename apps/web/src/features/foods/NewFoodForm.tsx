import { useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api'
import { toDecimal } from '../../shared/format'
import { createFood, type Food, type NewFood } from './api'

type Props = { initialName: string; onCreated: (food: Food) => void; onCancel?: () => void }

const FIELDS: { key: keyof NewFood; label: string; placeholder: string }[] = [
  { key: 'kcalPer100g', label: 'Énergie (kcal)', placeholder: '372' },
  { key: 'carbsPer100g', label: 'Glucides (g)', placeholder: '58,7' },
  { key: 'proteinPer100g', label: 'Protéines (g)', placeholder: '13,5' },
  { key: 'fatPer100g', label: 'Lipides (g)', placeholder: '7' },
]

const EMPTY: NewFood = { name: '', kcalPer100g: '', carbsPer100g: '', proteinPer100g: '', fatPer100g: '' }

export function NewFoodForm({ initialName, onCreated, onCancel }: Props) {
  const [food, setFood] = useState<NewFood>({ ...EMPTY, name: initialName })
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (key: keyof NewFood, value: string) => setFood((f) => ({ ...f, [key]: value }))
  const complete = Object.values(food).every((v) => v.trim())

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const created = await createFood({
        name: food.name.trim(),
        kcalPer100g: toDecimal(food.kcalPer100g),
        carbsPer100g: toDecimal(food.carbsPer100g),
        proteinPer100g: toDecimal(food.proteinPer100g),
        fatPer100g: toDecimal(food.fatPer100g),
      })
      setFood(EMPTY)
      onCreated(created)
    } catch (err: unknown) {
      setErrors(err instanceof ApiError ? { form: err.message, ...err.fieldErrors } : { form: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const fieldError = FIELDS.map((f) => errors[f.key]).find(Boolean)
  return (
    <form className="sheet__body" onSubmit={submit} noValidate>
      <p className="muted">Valeurs de l’emballage, colonne « pour 100 g ».</p>
      <label className="field">
        <span className="field__label">Nom de l’aliment</span>
        <input
          className="input"
          value={food.name}
          maxLength={120}
          onChange={(e) => set('name', e.target.value)}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'name-error' : undefined}
          required
        />
      </label>
      {errors.name && (
        <p id="name-error" role="alert" className="field-error">
          {errors.name}
        </p>
      )}
      <div className="nutrition-grid">
        {FIELDS.map((f) => (
          <label key={f.key} className="field">
            <span className="field__label">{f.label}</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder={`ex. ${f.placeholder}`}
              value={food[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              aria-invalid={Boolean(errors[f.key])}
              required
            />
          </label>
        ))}
      </div>
      {fieldError && (
        <p role="alert" className="field-error">
          {fieldError}
        </p>
      )}
      {errors.form && !errors.name && !fieldError && (
        <p role="alert" className="field-error">
          {errors.form}
        </p>
      )}
      <div className="sheet__actions">
        {onCancel && (
          <button type="button" className="button button--ghost" onClick={onCancel}>
            Retour
          </button>
        )}
        <button type="submit" className="button" disabled={busy || !complete}>
          {busy ? 'Création…' : 'Créer l’aliment'}
        </button>
      </div>
    </form>
  )
}
