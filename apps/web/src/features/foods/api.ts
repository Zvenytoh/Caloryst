import { api, list, str } from '../../shared/api'

export type Food = { id: string; name: string; kcalPer100g: string; proteinPer100g: string; carbsPer100g: string; fatPer100g: string }
export type NewFood = Omit<Food, 'id'>

const toFood = (o: Record<string, unknown>): Food => ({
  id: str(o, 'id'),
  name: str(o, 'name'),
  kcalPer100g: str(o, 'kcalPer100g'),
  proteinPer100g: str(o, 'proteinPer100g'),
  carbsPer100g: str(o, 'carbsPer100g'),
  fatPer100g: str(o, 'fatPer100g'),
})

export async function fetchFoods(signal?: AbortSignal): Promise<Food[]> {
  const body = await api('/foods', signal ? { signal } : {})
  return body ? list(body, 'foods').map(toFood) : []
}

/** Throws ApiError with field errors keyed like NewFood. */
export async function createFood(food: NewFood): Promise<Food> {
  const body = await api('/foods', { method: 'POST', body: JSON.stringify(food) })
  if (!body) throw new Error('Réponse vide.')
  return toFood(body)
}
