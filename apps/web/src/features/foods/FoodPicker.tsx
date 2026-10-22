import { useState } from 'react'
import { ApiError, errorMessage } from '../../shared/api'
import { formatKcal } from '../../shared/format'
import { SOURCE_LABEL, foodByBarcode, searchOpenFoodFacts, type Food } from './api'
import { useFoodSearch } from './useFoodSearch'

type Props = {
  query: string
  onQueryChange: (q: string) => void
  selected: Food | null
  onSelect: (food: Food) => void
}

/** Searches the user's foods, CIQUAL and Open Food Facts; the caller owns the selection. */
export function FoodPicker({ query, onQueryChange, selected, onSelect }: Props) {
  const { results, error: searchError } = useFoodSearch(query)
  // Open Food Facts and barcode results belong to the query they were fetched for.
  const [extra, setExtra] = useState<{ query: string; foods: Food[] }>({ query: '', foods: [] })
  const [offError, setOffError] = useState<string | null>(null)
  const [offBusy, setOffBusy] = useState(false)
  const [barcode, setBarcode] = useState('')

  const fetchExtra = async (load: () => Promise<Food[]>) => {
    setOffBusy(true)
    setOffError(null)
    try {
      const found = await load()
      setExtra({ query, foods: found })
      if (found.length === 1 && found[0]) onSelect(found[0])
    } catch (err: unknown) {
      setOffError(err instanceof ApiError && err.status === 404 ? 'Produit introuvable sur Open Food Facts.' : errorMessage(err))
    } finally {
      setOffBusy(false)
    }
  }

  const error = offError ?? searchError
  const known = new Set(results?.map((f) => f.id))
  const shown = [...(results ?? []), ...(extra.query === query ? extra.foods : []).filter((f) => !known.has(f.id))]
  const canSearchOff = query.trim().length >= 2

  return (
    <div className="food-search">
      <label className="field">
        <span className="field__label">Aliment</span>
        <input
          className="input"
          type="search"
          placeholder="Rechercher : pomme, riz cuit, skyr…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </label>

      <fieldset className="food-picker">
        <legend className="visually-hidden">Choisir un aliment</legend>
        {!results && !error && <p className="muted">Recherche…</p>}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {results && shown.length === 0 && <p className="muted">{query.trim() ? 'Aucun aliment ne correspond.' : 'Tapez le nom d’un aliment.'}</p>}
        {shown.map((food) => (
          <label key={food.id} className="food-option">
            <input type="radio" name="food" checked={selected?.id === food.id} onChange={() => onSelect(food)} />
            <span className="food-option__name">
              {food.name}
              {food.brand && <span className="muted"> · {food.brand}</span>}
            </span>
            <span className="muted">{formatKcal(food.kcalPer100g)} kcal/100 g</span>
            <span className="food-option__macros muted">
              <span className={`source source--${food.source}`}>{SOURCE_LABEL[food.source]}</span> G {formatKcal(food.carbsPer100g)} · P{' '}
              {formatKcal(food.proteinPer100g)} · L {formatKcal(food.fatPer100g)}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="food-search__more">
        <button type="button" className="button button--ghost button--small" disabled={!canSearchOff || offBusy} onClick={() => void fetchExtra(() => searchOpenFoodFacts(query.trim()))}>
          {offBusy ? 'Recherche…' : 'Chercher sur Open Food Facts'}
        </button>
        <form
          className="barcode"
          onSubmit={(e) => {
            e.preventDefault()
            void fetchExtra(async () => [await foodByBarcode(barcode.trim())])
          }}
        >
          <input
            className="input input--grams"
            inputMode="numeric"
            placeholder="Code-barres"
            aria-label="Code-barres"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))}
          />
          <button type="submit" className="button button--ghost button--small" disabled={barcode.length < 6 || offBusy}>
            OK
          </button>
        </form>
      </div>
      <p className="muted fine-print">Données : CIQUAL (ANSES, Licence Ouverte Etalab 2.0) et Open Food Facts (ODbL), contributeurs Open Food Facts.</p>
    </div>
  )
}
