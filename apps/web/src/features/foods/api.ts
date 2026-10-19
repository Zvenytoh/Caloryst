import { api, list, str } from '../../shared/api'

export type Food = { id: string; name: string; kcalPer100g: string }

const toFood = (o: Record<string, unknown>): Food => ({ id: str(o, 'id'), name: str(o, 'name'), kcalPer100g: str(o, 'kcalPer100g') })

export async function fetchFoods(signal?: AbortSignal): Promise<Food[]> {
  const body = await api('/foods', signal ? { signal } : {})
  return body ? list(body, 'foods').map(toFood) : []
}

/** Throws ApiError with field errors for `name` and `kcalPer100g`. */
export async function createFood(name: string, kcalPer100g: string): Promise<Food> {
  const body = await api('/foods', { method: 'POST', body: JSON.stringify({ name, kcalPer100g }) })
  if (!body) throw new Error('Réponse vide.')
  return toFood(body)
}
