import { useRef, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api'
import { formatDay, formatGrams, formatKcal, toDecimal } from '../../shared/format'
import { CloseIcon } from '../../shared/icons'
import { tap, toast } from '../../shared/toast'
import { useSheet } from '../../shared/useSheet'
import type { Food } from '../foods/api'
import { FoodPicker } from '../foods/FoodPicker'
import { NewFoodForm } from '../foods/NewFoodForm'
import { MEAL_LABEL, deleteEntry, recordEntry, type Meal } from './api'

type Props = { date: string; meal: Meal; onClose: () => void; onAdded: () => void }

const QUICK_GRAMS = ['50', '100', '150', '200']

const TO_MEAL: Record<Meal, string> = {
  breakfast: 'au petit-déjeuner',
  lunch: 'au déjeuner',
  dinner: 'au dîner',
  snack: 'à la collation',
}

export function AddEntryDialog({ date, meal, onClose, onAdded }: Props) {
  const { dialogProps, grabberProps, close } = useSheet('input[type=search]')
  const gramsInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Food | null>(null)
  const [grams, setGrams] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const select = (food: Food) => {
    setSelected(food)
    // Next step is the portion: save a tap.
    gramsInput.current?.focus()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selected) return setErrors({ food: 'Choisissez un aliment.' })
    setBusy(true)
    setErrors({})
    try {
      const entry = await recordEntry(selected.id, toDecimal(grams), date, meal)
      tap()
      toast(`${entry.foodName}, ${formatGrams(entry.grams)} g ajouté ${TO_MEAL[meal]}`, {
        label: 'Annuler',
        run: async () => {
          await deleteEntry(entry.id)
          onAdded()
        },
      })
      onAdded()
      close()
    } catch (err: unknown) {
      setErrors(err instanceof ApiError ? { form: err.message, ...err.fieldErrors } : { form: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const created = (food: Food) => {
    setSelected(food)
    setQuery(food.name)
    setCreating(false)
  }

  return (
    <dialog {...dialogProps} className="sheet" aria-labelledby="add-title" onClose={onClose}>
      <div className="sheet__grabber" aria-hidden="true" {...grabberProps} />
      <div className="sheet__head" {...grabberProps}>
        <div>
          <h2 id="add-title">{MEAL_LABEL[meal]}</h2>
          <p className="muted">Ajouter une portion · {formatDay(date)}</p>
        </div>
        <button type="button" className="icon-button" aria-label="Fermer" onClick={close} onPointerDown={(e) => e.stopPropagation()}>
          <CloseIcon size={20} />
        </button>
      </div>

      {creating ? (
        <NewFoodForm initialName={query.trim()} onCreated={created} onCancel={() => setCreating(false)} />
      ) : (
        <div className="sheet__body">
          <FoodPicker query={query} onQueryChange={setQuery} selected={selected} onSelect={select} />
          <button type="button" className="link-button" onClick={() => setCreating(true)}>
            + Créer un aliment{query.trim() ? ` « ${query.trim()} »` : ''}
          </button>

          <form className="portion" onSubmit={submit} noValidate>
            {selected ? (
              <p className="portion__selected" key={selected.id}>
                <strong>{selected.name}</strong> <span className="muted">· {formatKcal(selected.kcalPer100g)} kcal/100 g</span>
              </p>
            ) : (
              errors.food && (
                <p role="alert" className="field-error">
                  {errors.food}
                </p>
              )
            )}
            <label className="field">
              <span className="field__label">Portion (g)</span>
              <input
                ref={gramsInput}
                className="input input--grams"
                inputMode="decimal"
                placeholder="ex. 150"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                aria-invalid={Boolean(errors.grams)}
                aria-describedby={errors.grams ? 'grams-error' : undefined}
                required
              />
            </label>
            <div className="chips" role="group" aria-label="Portions rapides">
              {QUICK_GRAMS.map((g) => (
                <button key={g} type="button" className={`chip${grams === g ? ' chip--on' : ''}`} aria-pressed={grams === g} onClick={() => setGrams(g)}>
                  {g} g
                </button>
              ))}
            </div>
            {errors.grams && (
              <p id="grams-error" role="alert" className="field-error">
                {errors.grams}
              </p>
            )}
            {errors.form && !errors.grams && (
              <p role="alert" className="field-error">
                {errors.form}
              </p>
            )}
            <div className="sheet__actions">
              <button type="button" className="button button--ghost" onClick={close}>
                Annuler
              </button>
              <button type="submit" className="button" disabled={busy || !selected || !grams.trim()}>
                {busy ? 'Ajout…' : 'Ajouter au journal'}
              </button>
            </div>
          </form>
        </div>
      )}
    </dialog>
  )
}
