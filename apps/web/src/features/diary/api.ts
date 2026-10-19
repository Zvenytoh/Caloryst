import { api, list, str } from '../../shared/api'

export type Entry = { id: string; foodName: string; grams: string; kcalPer100g: string; kcal: string }
export type Diary = { date: string; entries: Entry[]; totalKcal: string }

const toEntry = (o: Record<string, unknown>): Entry => ({
  id: str(o, 'id'),
  foodName: str(o, 'foodName'),
  grams: str(o, 'grams'),
  kcalPer100g: str(o, 'kcalPer100g'),
  kcal: str(o, 'kcal'),
})

export async function fetchDiary(date: string, signal: AbortSignal): Promise<Diary> {
  const body = await api(`/diary?date=${encodeURIComponent(date)}`, { signal })
  if (!body) throw new Error('Réponse vide.')
  return { date: str(body, 'date'), entries: list(body, 'entries').map(toEntry), totalKcal: str(body, 'totalKcal') }
}

export async function recordEntry(foodId: string, grams: string, date: string): Promise<void> {
  await api('/diary/entries', { method: 'POST', body: JSON.stringify({ foodId, grams, date }) })
}

export async function updateEntry(id: string, grams: string): Promise<void> {
  await api(`/diary/entries/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ grams }) })
}

export async function deleteEntry(id: string): Promise<void> {
  await api(`/diary/entries/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
