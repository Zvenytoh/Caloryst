import { api } from '../../shared/api'
import { toGoals, type Goals } from '../diary/api'

/** Throws ApiError with field errors keyed like Goals. */
export async function saveGoals(goals: Goals): Promise<Goals> {
  const body = await api('/goals', { method: 'PUT', body: JSON.stringify(goals) })
  if (!body) throw new Error('Réponse vide.')
  return toGoals(body)
}

export async function fetchGoals(signal: AbortSignal): Promise<Goals> {
  const body = await api('/goals', { signal })
  if (!body) throw new Error('Réponse vide.')
  return toGoals(body)
}
