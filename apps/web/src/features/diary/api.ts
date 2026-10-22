import { api, isObject, list, str } from '../../shared/api'

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type Meal = (typeof MEALS)[number]

export type Entry = {
  id: string
  meal: Meal
  foodName: string
  grams: string
  kcalPer100g: string
  kcal: string
  proteinG: string
  carbsG: string
  fatG: string
}
export type MealDay = { meal: Meal; kcal: string; targetKcal: string; entries: Entry[] }
export type Activity = { id: string; name: string; kcal: string }
export type Goals = { kcal: string; proteinG: string; carbsG: string; fatG: string; waterMl: string }
export type Diary = {
  date: string
  goals: Goals
  totals: { kcal: string; proteinG: string; carbsG: string; fatG: string }
  burnedKcal: string
  remainingKcal: string
  waterMl: string
  meals: MealDay[]
  activities: Activity[]
}

type Json = Record<string, unknown>

function meal(value: unknown): Meal {
  const found = MEALS.find((m) => m === value)
  if (!found) throw new Error('Réponse du serveur inattendue.')
  return found
}

function obj(o: Json, key: string): Json {
  const value = o[key]
  if (!isObject(value)) throw new Error('Réponse du serveur inattendue.')
  return value
}

const toEntry = (o: Json): Entry => ({
  id: str(o, 'id'),
  meal: meal(o.meal),
  foodName: str(o, 'foodName'),
  grams: str(o, 'grams'),
  kcalPer100g: str(o, 'kcalPer100g'),
  kcal: str(o, 'kcal'),
  proteinG: str(o, 'proteinG'),
  carbsG: str(o, 'carbsG'),
  fatG: str(o, 'fatG'),
})

export const toGoals = (o: Json): Goals => ({
  kcal: str(o, 'kcal'),
  proteinG: str(o, 'proteinG'),
  carbsG: str(o, 'carbsG'),
  fatG: str(o, 'fatG'),
  waterMl: str(o, 'waterMl'),
})

export async function fetchDiary(date: string, signal: AbortSignal): Promise<Diary> {
  const body = await api(`/diary?date=${encodeURIComponent(date)}`, { signal })
  if (!body) throw new Error('Réponse vide.')
  const totals = obj(body, 'totals')
  return {
    date: str(body, 'date'),
    goals: toGoals(obj(body, 'goals')),
    totals: { kcal: str(totals, 'kcal'), proteinG: str(totals, 'proteinG'), carbsG: str(totals, 'carbsG'), fatG: str(totals, 'fatG') },
    burnedKcal: str(body, 'burnedKcal'),
    remainingKcal: str(body, 'remainingKcal'),
    waterMl: str(body, 'waterMl'),
    meals: list(body, 'meals').map((m) => ({
      meal: meal(m.meal),
      kcal: str(m, 'kcal'),
      targetKcal: str(m, 'targetKcal'),
      entries: list(m, 'entries').map(toEntry),
    })),
    activities: list(body, 'activities').map((a) => ({ id: str(a, 'id'), name: str(a, 'name'), kcal: str(a, 'kcal') })),
  }
}

/** Records a portion and returns the created entry (its id allows undo). */
export async function recordEntry(foodId: string, grams: string, date: string, meal: Meal): Promise<Entry> {
  const body = await api('/diary/entries', { method: 'POST', body: JSON.stringify({ foodId, grams, date, meal }) })
  if (!body) throw new Error('Réponse vide.')
  return toEntry(body)
}

export type WeekDay = { date: string; kcal: string }
export type Week = { goalKcal: string; days: WeekDay[] }

/** Monday to Sunday around `date`, with the energy eaten each day. */
export async function fetchWeek(date: string, signal: AbortSignal): Promise<Week> {
  const body = await api(`/diary/week?date=${encodeURIComponent(date)}`, { signal })
  if (!body) throw new Error('Réponse vide.')
  return { goalKcal: str(body, 'goalKcal'), days: list(body, 'days').map((d) => ({ date: str(d, 'date'), kcal: str(d, 'kcal') })) }
}

export async function updateEntry(id: string, grams: string): Promise<void> {
  await api(`/diary/entries/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ grams }) })
}

export async function deleteEntry(id: string): Promise<void> {
  await api(`/diary/entries/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function changeWater(date: string, deltaMl: number): Promise<void> {
  await api('/water', { method: 'POST', body: JSON.stringify({ date, deltaMl }) })
}

export async function addActivity(date: string, name: string, kcal: string): Promise<void> {
  await api('/activities', { method: 'POST', body: JSON.stringify({ date, name, kcal }) })
}

export async function deleteActivity(id: string): Promise<void> {
  await api(`/activities/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collation',
}
