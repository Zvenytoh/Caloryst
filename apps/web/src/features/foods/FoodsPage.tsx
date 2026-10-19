import { useEffect, useState } from 'react'
import { errorMessage } from '../../shared/api'
import { formatKcal } from '../../shared/format'
import { fetchFoods, type Food } from './api'
import { NewFoodForm } from './NewFoodForm'

export function FoodsPage() {
  const [foods, setFoods] = useState<Food[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetchFoods(controller.signal)
      .then(setFoods)
      .catch((err: unknown) => !controller.signal.aborted && setError(errorMessage(err)))
    return () => controller.abort()
  }, [])

  const needle = query.trim().toLocaleLowerCase('fr')
  const matches = foods?.filter((f) => f.name.toLocaleLowerCase('fr').includes(needle)) ?? []

  return (
    <div className="page-body">
      <header className="day-head">
        <h1 className="day-head__title">Aliments</h1>
      </header>
      <div className="dashboard">
        <section className="dashboard__main section" aria-labelledby="foods-title">
          <h2 id="foods-title" className="visually-hidden">
            Vos aliments
          </h2>
          <input className="input" type="search" placeholder="Rechercher un aliment" aria-label="Rechercher un aliment" value={query} onChange={(e) => setQuery(e.target.value)} />
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          {!foods && !error && <div className="skeleton" aria-busy="true" aria-label="Chargement des aliments" />}
          {foods && matches.length === 0 && <p className="muted">{foods.length ? 'Aucun aliment ne correspond.' : 'Aucun aliment pour le moment.'}</p>}
          {matches.length > 0 && (
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
                  {matches.map((f) => (
                    <tr key={f.id}>
                      <th scope="row">{f.name}</th>
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
        </section>
        <section className="dashboard__side card" aria-labelledby="new-food-title">
          <h2 id="new-food-title" className="card__title">
            Nouvel aliment
          </h2>
          <NewFoodForm initialName="" onCreated={(food) => setFoods((list) => [...(list ?? []), food].sort((a, b) => a.name.localeCompare(b.name, 'fr')))} />
        </section>
      </div>
    </div>
  )
}
