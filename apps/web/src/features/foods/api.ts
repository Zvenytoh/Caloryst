import { api, isObject, list, str } from '../../shared/api'

export type FoodSource = 'user' | 'ciqual' | 'openfoodfacts'

export type Food = {
  id: string
  name: string
  source: FoodSource
  brand: string | null
  kcalPer100g: string
  proteinPer100g: string
  carbsPer100g: string
  fatPer100g: string
  /** Known detailed nutrients per 100 g, by nutrient key; missing keys are unknown. */
  details: Record<string, string>
}
export type NewFood = Omit<Food, 'id' | 'source' | 'brand'>

const SOURCES: readonly FoodSource[] = ['user', 'ciqual', 'openfoodfacts']

function details(value: unknown): Record<string, string> {
  if (!isObject(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string'))
}

const toFood = (o: Record<string, unknown>): Food => ({
  id: str(o, 'id'),
  name: str(o, 'name'),
  source: SOURCES.find((s) => s === o.source) ?? 'user',
  brand: typeof o.brand === 'string' ? o.brand : null,
  kcalPer100g: str(o, 'kcalPer100g'),
  proteinPer100g: str(o, 'proteinPer100g'),
  carbsPer100g: str(o, 'carbsPer100g'),
  fatPer100g: str(o, 'fatPer100g'),
  details: details(o.details),
})

export async function fetchFoods(signal?: AbortSignal): Promise<Food[]> {
  const body = await api('/foods', signal ? { signal } : {})
  return body ? list(body, 'foods').map(toFood) : []
}

/** Throws ApiError with field errors keyed like NewFood or by nutrient key. */
export async function createFood(food: NewFood): Promise<Food> {
  const body = await api('/foods', { method: 'POST', body: JSON.stringify(food) })
  if (!body) throw new Error('Réponse vide.')
  return toFood(body)
}

/** The user's foods matching `query`, then CIQUAL and cached Open Food Facts products. */
export async function searchFoods(query: string, signal: AbortSignal): Promise<Food[]> {
  const body = await api(`/foods?q=${encodeURIComponent(query)}`, { signal })
  return body ? list(body, 'foods').map(toFood) : []
}

/** Live Open Food Facts search (rate-limited server-side; throws ApiError 429 when busy). */
export async function searchOpenFoodFacts(query: string): Promise<Food[]> {
  const body = await api(`/foods/openfoodfacts?q=${encodeURIComponent(query)}`)
  return body ? list(body, 'foods').map(toFood) : []
}

export async function foodByBarcode(code: string): Promise<Food> {
  const body = await api(`/foods/barcode/${encodeURIComponent(code)}`)
  if (!body) throw new Error('Réponse vide.')
  return toFood(body)
}
