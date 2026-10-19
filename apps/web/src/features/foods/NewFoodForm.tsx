import { useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api'
import { toDecimal } from '../../shared/format'
import { GROUP_LABEL, NUTRIENTS } from '../../shared/nutrients'
import { createFood, type Food } from './api'

type Props = { initialName: string; onCreated: (food: Food) => void; onCancel?: () => void }

type MainKey = 'kcalPer100g' | 'carbsPer100g' | 'proteinPer100g' | 'fatPer100g'

const MAIN: { key: MainKey; label: string; placeholder: string }[] = [
  { key: 'kcalPer100g', label: 'Énergie (kcal)', placeholder: '372' },
  { key: 'carbsPer100g', label: 'Glucides (g)', placeholder: '58,7' },
  { key: 'proteinPer100g', label: 'Protéines (g)', placeholder: '13,5' },
  { key: 'fatPer100g', label: 'Lipides (g)', placeholder: '7' },
]

const GROUPS = (['quality', 'vitamins', 'minerals'] as const).map((group) => ({
  group,
  label: GROUP_LABEL[group],
  fields: NUTRIENTS.filter((n) => n.group === group),
}))

const EMPTY_MAIN: Record<MainKey, string> = { kcalPer100g: '', carbsPer100g: '', proteinPer100g: '', fatPer100g: '' }

export function NewFoodForm({ initialName, onCreated, onCancel }: Props) {
  const [name, setName] = useState(initialName)
  const [main, setMain] = useState(EMPTY_MAIN)
  const [details, setDetails] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const complete = name.trim() !== '' && Object.values(main).every((v) => v.trim())
  const known = Object.values(details).filter((v) => v.trim()).length

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const created = await createFood({
        name: name.trim(),
        kcalPer100g: toDecimal(main.kcalPer100g),
        carbsPer100g: toDecimal(main.carbsPer100g),
        proteinPer100g: toDecimal(main.proteinPer100g),
        fatPer100g: toDecimal(main.fatPer100g),
        details: Object.fromEntries(Object.entries(details).filter(([, v]) => v.trim()).map(([k, v]) => [k, toDecimal(v)])),
      })
      setName('')
      setMain(EMPTY_MAIN)
      setDetails({})
      onCreated(created)
    } catch (err: unknown) {
      setErrors(err instanceof ApiError ? { form: err.message, ...err.fieldErrors } : { form: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const fieldError = Object.entries(errors).find(([k]) => k !== 'form' && k !== 'name')?.[1]
  return (
    <form className="sheet__body" onSubmit={submit} noValidate>
      <p className="muted">Valeurs de l’emballage, colonne « pour 100 g ».</p>
      <label className="field">
        <span className="field__label">Nom de l’aliment</span>
        <input
          className="input"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
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
        {MAIN.map((f) => (
          <label key={f.key} className="field">
            <span className="field__label">{f.label}</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder={`ex. ${f.placeholder}`}
              value={main[f.key]}
              onChange={(e) => setMain({ ...main, [f.key]: e.target.value })}
              aria-invalid={Boolean(errors[f.key])}
              required
            />
          </label>
        ))}
      </div>

      <details className="disclosure">
        <summary>
          Détails nutritionnels <span className="muted">· optionnel{known ? ` · ${known} renseigné${known > 1 ? 's' : ''}` : ''}</span>
        </summary>
        <p className="muted disclosure__hint">Laissez vide ce que l’emballage n’indique pas : une valeur absente n’est jamais comptée comme zéro.</p>
        {GROUPS.map((g) => (
          <fieldset key={g.group} className="detail-group">
            <legend>{g.label}</legend>
            <div className="nutrition-grid">
              {g.fields.map((f) => (
                <label key={f.key} className="field">
                  <span className="field__label">
                    {f.label} ({f.unit})
                  </span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={details[f.key] ?? ''}
                    onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })}
                    aria-invalid={Boolean(errors[f.key])}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </details>

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
