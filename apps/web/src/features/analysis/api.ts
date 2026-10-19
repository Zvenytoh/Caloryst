import { api, isObject, list, str } from '../../shared/api'
import { toGoals, type Goals } from '../diary/api'

export type Sex = 'female' | 'male'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type Objective = 'lose_fat' | 'maintain' | 'gain_muscle'

export type Profile = {
  sex: Sex
  birthYear: number
  heightCm: string
  weightKg: string
  activity: ActivityLevel
  objective: Objective
}
export type Recommendation = { restingKcal: string; maintenanceKcal: string; goals: Goals }
export type ProfileState = { profile: Profile | null; recommendation: Recommendation | null }

export type Status = 'good' | 'low' | 'high'
export type Finding = { topic: string; status: Status; value: string; min: string | null; max: string | null }
export type NutrientRow = {
  key: string
  reference: { kind: 'atLeast' | 'atMost'; amount: string }
  dayAmount: string
  dayKnown: number
  dayTotal: number
  weekAverage: string
  weekKnown: number
  weekTotal: number
}
export type Analysis = {
  from: string
  to: string
  periodDays: number
  daysLogged: number
  goals: Goals
  profile: ProfileState
  averages: { kcal: string; burnedKcal: string; netKcal: string; proteinG: string; carbsG: string; fatG: string; proteinPerKg: string | null }
  energySplit: { proteinPct: string; carbsPct: string; fatPct: string } | null
  findings: Finding[]
  nutrients: NutrientRow[]
}

type Json = Record<string, unknown>
const bad = () => new Error('Réponse du serveur inattendue.')

function obj(o: Json, key: string): Json {
  const v = o[key]
  if (!isObject(v)) throw bad()
  return v
}

const optStr = (o: Json, key: string) => (typeof o[key] === 'string' ? (o[key] as string) : null)
const num = (o: Json, key: string) => {
  const v = o[key]
  if (typeof v !== 'number') throw bad()
  return v
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  const found = allowed.find((a) => a === value)
  if (!found) throw bad()
  return found
}

function toProfileState(o: Json): ProfileState {
  const p = o.profile
  const r = o.recommendation
  return {
    profile: isObject(p)
      ? {
          sex: oneOf(p.sex, ['female', 'male'] as const),
          birthYear: num(p, 'birthYear'),
          heightCm: str(p, 'heightCm'),
          weightKg: str(p, 'weightKg'),
          activity: oneOf(p.activity, ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const),
          objective: oneOf(p.objective, ['lose_fat', 'maintain', 'gain_muscle'] as const),
        }
      : null,
    recommendation: isObject(r)
      ? { restingKcal: str(r, 'restingKcal'), maintenanceKcal: str(r, 'maintenanceKcal'), goals: toGoals(obj(r, 'goals')) }
      : null,
  }
}

export async function fetchProfile(signal: AbortSignal): Promise<ProfileState> {
  const body = await api('/profile', { signal })
  if (!body) throw bad()
  return toProfileState(body)
}

/** Throws ApiError with field errors keyed like Profile. */
export async function saveProfile(profile: Profile): Promise<ProfileState> {
  const body = await api('/profile', { method: 'PUT', body: JSON.stringify(profile) })
  if (!body) throw bad()
  return toProfileState(body)
}

export async function fetchAnalysis(date: string, signal: AbortSignal): Promise<Analysis> {
  const b = await api(`/analysis?date=${encodeURIComponent(date)}`, { signal })
  if (!b) throw bad()
  const avg = obj(b, 'averages')
  const split = b.energySplit
  return {
    from: str(b, 'from'),
    to: str(b, 'to'),
    periodDays: num(b, 'periodDays'),
    daysLogged: num(b, 'daysLogged'),
    goals: toGoals(obj(b, 'goals')),
    profile: toProfileState(obj(b, 'profile')),
    averages: {
      kcal: str(avg, 'kcal'),
      burnedKcal: str(avg, 'burnedKcal'),
      netKcal: str(avg, 'netKcal'),
      proteinG: str(avg, 'proteinG'),
      carbsG: str(avg, 'carbsG'),
      fatG: str(avg, 'fatG'),
      proteinPerKg: optStr(avg, 'proteinPerKg'),
    },
    energySplit: isObject(split) ? { proteinPct: str(split, 'proteinPct'), carbsPct: str(split, 'carbsPct'), fatPct: str(split, 'fatPct') } : null,
    findings: list(b, 'findings').map((f) => ({
      topic: str(f, 'topic'),
      status: oneOf(f.status, ['good', 'low', 'high'] as const),
      value: str(f, 'value'),
      min: optStr(f, 'min'),
      max: optStr(f, 'max'),
    })),
    nutrients: list(b, 'nutrients').map((n) => {
      const ref = obj(n, 'reference')
      return {
        key: str(n, 'key'),
        reference: { kind: oneOf(ref.kind, ['atLeast', 'atMost'] as const), amount: str(ref, 'amount') },
        dayAmount: str(n, 'dayAmount'),
        dayKnown: num(n, 'dayKnown'),
        dayTotal: num(n, 'dayTotal'),
        weekAverage: str(n, 'weekAverage'),
        weekKnown: num(n, 'weekKnown'),
        weekTotal: num(n, 'weekTotal'),
      }
    }),
  }
}
