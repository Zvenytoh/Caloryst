import { useState } from 'react'
import { formatKcal } from '../../shared/format'
import { toast } from '../../shared/toast'
import { SOURCE_LABEL, type Food } from './api'
import { FoodDetailSheet } from './FoodDetailSheet'
import { NewFoodForm } from './NewFoodForm'
import { useFoodSearch } from './useFoodSearch'

export function FoodsPage() {
  const [query, setQuery] = useState('')
  const [version, setVersion] = useState(0)
  const [open, setOpen] = useState<Food | null>(null)
  const { results, error } = useFoodSearch(query, version)

  return (
    <div className="page-body">
      <header className="day-head">
        <div>
          <h1 className="day-head__title">Aliments</h1>
          <p className="muted">Vos aliments, la table CIQUAL et les produits Open Food Facts déjà consultés.</p>
        </div>
      </header>
      <div className="dashboard">
        <section className="dashboard__main section" aria-labelledby="foods-title">
          <h2 id="foods-title" className="visually-hidden">
            Rechercher un aliment
          </h2>
          <input
            className="input"
            type="search"
            placeholder="Rechercher : lentilles, yaourt nature, saumon…"
            aria-label="Rechercher un aliment"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          {!results && !error && <div className="skeleton" aria-busy="true" aria-label="Chargement des aliments" />}
          {results && results.length === 0 && (
            <p className="muted">{query.trim() ? 'Aucun aliment ne correspond.' : 'Aucun aliment personnel pour le moment : cherchez dans le catalogue ou créez-en un.'}</p>
          )}
          {results && results.length > 0 && (
            <div className="card table-card">
              <table className="food-table">
                <thead>
                  <tr>
                    <th scope="col">Aliment (pour 100 g)</th>
                    <th scope="col">kcal</th>
                    <th scope="col">Glucides</th>
                    <th scope="col">Protéines</th>
                    <th scope="col">Lipides</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((f) => (
                    <tr key={f.id}>
                      <th scope="row">
                        <button type="button" className="food-table__name" onClick={() => setOpen(f)}>
                          {f.name}
                        </button>
                        <span className={`source source--${f.source}`}>{SOURCE_LABEL[f.source]}</span>
                        {f.brand && <span className="muted"> {f.brand}</span>}
                      </th>
                      <td>{formatKcal(f.kcalPer100g)}</td>
                      <td>{formatKcal(f.carbsPer100g)} g</td>
                      <td>{formatKcal(f.proteinPer100g)} g</td>
                      <td>{formatKcal(f.fatPer100g)} g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted fine-print">Données : CIQUAL (ANSES, Licence Ouverte Etalab 2.0) et Open Food Facts (ODbL), contributeurs Open Food Facts.</p>
        </section>
        <section className="dashboard__side card" aria-labelledby="new-food-title">
          <h2 id="new-food-title" className="card__title">
            Nouvel aliment
          </h2>
          <NewFoodForm
            initialName=""
            onCreated={(food) => {
              toast(`Aliment créé : ${food.name}`)
              setVersion((v) => v + 1)
            }}
          />
        </section>
      </div>
      {open && <FoodDetailSheet food={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
