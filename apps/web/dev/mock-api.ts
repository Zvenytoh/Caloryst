import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'

// shortcut: in-memory stand-in for the planned Rust API (docs/ARCHITECTURE.md §8), dev and preview only.
// Replace with a proxy to the real API once it exists. Data is lost on restart.

const MACROS = ['protein', 'carbs', 'fat'] as const
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const
// Share of the daily energy goal suggested for each meal, in percent.
const MEAL_SHARE: Record<Meal, bigint> = { breakfast: 25n, lunch: 35n, dinner: 30n, snack: 10n }

type Meal = (typeof MEALS)[number]
type Nutrition = { kcalPer100g: string; proteinPer100g: string; carbsPer100g: string; fatPer100g: string }
type Food = Nutrition & { id: string; name: string }
type Entry = Nutrition & { id: string; date: string; meal: Meal; foodName: string; grams: string }
type Activity = { id: string; date: string; name: string; kcal: string }
type Goals = { kcal: string; proteinG: string; carbsG: string; fatG: string; waterMl: string }
type Account = {
  displayName: string
  foods: Food[]
  entries: Entry[]
  activities: Activity[]
  water: Map<string, number>
  goals: Goals
}

const COOKIE = 'kalo_dev_session'
const accounts = new Map<string, Account>()
// Public demo deployments create an account per visitor; keep memory bounded by dropping the oldest.
const MAX_ACCOUNTS = 500

const DECIMAL = /^\d{1,7}(\.\d{1,3})?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Parses a non-negative decimal string into thousandths, or null when malformed. */
export function toMilli(value: unknown): bigint | null {
  if (typeof value !== 'string' || !DECIMAL.test(value)) return null
  const [whole = '0', frac = ''] = value.split('.')
  return BigInt(whole) * 1000n + BigInt(frac.padEnd(3, '0'))
}

/** Formats millionths as a decimal string rounded half away from zero to one decimal place. */
function fromMicro(micro: bigint): string {
  const sign = micro < 0n ? '-' : ''
  const abs = micro < 0n ? -micro : micro
  const tenths = (abs + 50_000n) / 100_000n
  return `${tenths === 0n ? '' : sign}${tenths / 10n}.${tenths % 10n}`
}

/** Sum of grams × value-per-100 g over portions, in millionths (unrounded). */
function scaled(portions: Entry[], field: keyof Nutrition): bigint {
  return portions.reduce((sum, p) => sum + (toMilli(p.grams) ?? 0n) * (toMilli(p[field]) ?? 0n), 0n) / 100n
}

const micro = (value: string) => (toMilli(value) ?? 0n) * 1000n

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value)
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  if (body === undefined) return res.end()
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function fail(res: ServerResponse, status: number, code: string, message: string, fieldErrors?: Record<string, string>) {
  send(res, status, { code, message, ...(fieldErrors ? { fieldErrors } : {}), requestId: randomUUID() })
}

const invalid = (res: ServerResponse, fieldErrors: Record<string, string>) => fail(res, 422, 'validation', 'Vérifiez les champs.', fieldErrors)

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 16_384) return null
  }
  try {
    const value: unknown = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function sessionId(req: IncomingMessage): string | undefined {
  return req.headers.cookie
    ?.split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === COOKIE)?.[1]
}

/** Decimal string in [0, max] thousandths, or null. */
function bounded(value: unknown, max: bigint): string | null {
  const m = toMilli(value)
  return m !== null && m <= max ? (value as string) : null
}

function validGrams(value: unknown): value is string {
  const m = toMilli(value)
  return m !== null && m > 0n && m <= 5_000_000n
}

function entryDto(e: Entry) {
  return {
    id: e.id,
    meal: e.meal,
    foodName: e.foodName,
    grams: e.grams,
    kcalPer100g: e.kcalPer100g,
    kcal: fromMicro(scaled([e], 'kcalPer100g')),
    proteinG: fromMicro(scaled([e], 'proteinPer100g')),
    carbsG: fromMicro(scaled([e], 'carbsPer100g')),
    fatG: fromMicro(scaled([e], 'fatPer100g')),
  }
}

function diaryDto(account: Account, date: string) {
  const entries = account.entries.filter((e) => e.date === date)
  const activities = account.activities.filter((a) => a.date === date)
  const eaten = scaled(entries, 'kcalPer100g')
  const burned = activities.reduce((sum, a) => sum + micro(a.kcal), 0n)
  const goal = micro(account.goals.kcal)
  return {
    date,
    goals: account.goals,
    totals: {
      kcal: fromMicro(eaten),
      proteinG: fromMicro(scaled(entries, 'proteinPer100g')),
      carbsG: fromMicro(scaled(entries, 'carbsPer100g')),
      fatG: fromMicro(scaled(entries, 'fatPer100g')),
    },
    burnedKcal: fromMicro(burned),
    remainingKcal: fromMicro(goal - eaten + burned),
    waterMl: String(account.water.get(date) ?? 0),
    meals: MEALS.map((meal) => {
      const items = entries.filter((e) => e.meal === meal)
      return {
        meal,
        kcal: fromMicro(scaled(items, 'kcalPer100g')),
        targetKcal: fromMicro((goal * MEAL_SHARE[meal]) / 100n),
        entries: items.map(entryDto),
      }
    }),
    activities,
  }
}

const handler: Connect.NextHandleFunction = (req, res, next) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (!url.pathname.startsWith('/api/')) return next()
  void route(req, res, url).catch(() => fail(res, 500, 'internal', 'Une erreur inattendue est survenue.'))
}

async function route(req: IncomingMessage, res: ServerResponse, url: URL) {
  const path = url.pathname
  const method = req.method ?? 'GET'
  const sid = sessionId(req)
  const account = sid ? accounts.get(sid) : undefined

  if (method === 'GET' && path === '/api/v1/auth/login') {
    // Stands in for the OIDC redirect flow.
    const id = randomUUID()
    if (accounts.size >= MAX_ACCOUNTS) accounts.delete(accounts.keys().next().value ?? '')
    accounts.set(id, {
      displayName: 'Dan',
      foods: seedFoods(),
      entries: [],
      activities: [],
      water: new Map(),
      goals: { kcal: '2000', proteinG: '120', carbsG: '220', fatG: '65', waterMl: '2000' },
    })
    res.setHeader('Set-Cookie', `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax`)
    res.setHeader('Location', '/')
    return send(res, 302)
  }
  if (method === 'POST' && path === '/api/v1/auth/logout') {
    if (sid) accounts.delete(sid)
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
    return send(res, 204)
  }
  if (method === 'GET' && path === '/api/v1/session') {
    return send(res, 200, account ? { authenticated: true, user: { displayName: account.displayName } } : { authenticated: false })
  }
  if (!account) return fail(res, 401, 'unauthenticated', 'Connectez-vous pour continuer.')

  const body = method === 'POST' || method === 'PUT' || method === 'PATCH' ? await readJson(req) : {}
  if (!body) return fail(res, 400, 'malformed', 'Requête invalide.')

  if (path === '/api/v1/foods' && method === 'GET') {
    return send(res, 200, { foods: [...account.foods].sort((a, b) => a.name.localeCompare(b.name, 'fr')) })
  }
  if (path === '/api/v1/foods' && method === 'POST') {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const errors: Record<string, string> = {}
    if (name.length < 1 || name.length > 120) errors.name = 'Entre 1 et 120 caractères.'
    const kcal = bounded(body.kcalPer100g, 900_000n)
    if (!kcal) errors.kcalPer100g = 'Entre 0 et 900 kcal, 3 décimales maximum.'
    const macros = MACROS.map((m) => bounded(body[`${m}Per100g`], 100_000n))
    MACROS.forEach((m, i) => {
      if (!macros[i]) errors[`${m}Per100g`] = 'Entre 0 et 100 g, 3 décimales maximum.'
    })
    const [protein, carbs, fat] = macros
    if (!errors.proteinPer100g && !errors.carbsPer100g && !errors.fatPer100g) {
      const sum = MACROS.reduce((s, _m, i) => s + (toMilli(macros[i]) ?? 0n), 0n)
      if (sum > 100_000n) errors.fatPer100g = 'Protéines + glucides + lipides ne peuvent dépasser 100 g.'
    }
    if (Object.keys(errors).length || !kcal || !protein || !carbs || !fat) return invalid(res, errors)
    const food: Food = { id: randomUUID(), name, kcalPer100g: kcal, proteinPer100g: protein, carbsPer100g: carbs, fatPer100g: fat }
    account.foods.push(food)
    return send(res, 201, food)
  }

  if (path === '/api/v1/goals' && method === 'GET') return send(res, 200, account.goals)
  if (path === '/api/v1/goals' && method === 'PUT') {
    const limits: [keyof Goals, bigint, string][] = [
      ['kcal', 10_000_000n, 'Entre 0 et 10 000 kcal.'],
      ['proteinG', 1_000_000n, 'Entre 0 et 1000 g.'],
      ['carbsG', 1_000_000n, 'Entre 0 et 1000 g.'],
      ['fatG', 1_000_000n, 'Entre 0 et 1000 g.'],
      ['waterMl', 10_000_000n, 'Entre 0 et 10 000 ml.'],
    ]
    const errors: Record<string, string> = {}
    const next = { ...account.goals }
    for (const [key, max, message] of limits) {
      const value = bounded(body[key], max)
      if (value) next[key] = value
      else errors[key] = message
    }
    if (Object.keys(errors).length) return invalid(res, errors)
    account.goals = next
    return send(res, 200, next)
  }

  if (path === '/api/v1/diary' && method === 'GET') {
    const date = url.searchParams.get('date')
    if (!isCalendarDate(date)) return fail(res, 400, 'malformed', 'Date invalide.')
    return send(res, 200, diaryDto(account, date))
  }
  if (path === '/api/v1/diary/entries' && method === 'POST') {
    const errors: Record<string, string> = {}
    if (!validGrams(body.grams)) errors.grams = 'Entre 0 et 5000 g, 3 décimales maximum.'
    if (!isCalendarDate(body.date)) errors.date = 'Date invalide.'
    if (!MEALS.includes(body.meal as Meal)) errors.meal = 'Repas invalide.'
    if (Object.keys(errors).length) return invalid(res, errors)
    const food = account.foods.find((f) => f.id === body.foodId)
    if (!food) return fail(res, 404, 'not_found', 'Aliment introuvable.')
    const { id: _id, name, ...nutrition } = food
    const entry: Entry = {
      ...nutrition,
      id: randomUUID(),
      date: body.date as string,
      meal: body.meal as Meal,
      foodName: name,
      grams: body.grams as string,
    }
    account.entries.push(entry)
    return send(res, 201, entryDto(entry))
  }

  const entryMatch = /^\/api\/v1\/diary\/entries\/([\w-]+)$/.exec(path)
  if (entryMatch) {
    const entry = account.entries.find((e) => e.id === entryMatch[1])
    if (!entry) return fail(res, 404, 'not_found', 'Entrée introuvable.')
    if (method === 'PATCH') {
      if (!validGrams(body.grams)) return invalid(res, { grams: 'Entre 0 et 5000 g, 3 décimales maximum.' })
      entry.grams = body.grams
      return send(res, 200, entryDto(entry))
    }
    if (method === 'DELETE') {
      account.entries = account.entries.filter((e) => e !== entry)
      return send(res, 204)
    }
  }

  if (path === '/api/v1/water' && method === 'POST') {
    const delta = body.deltaMl
    if (!isCalendarDate(body.date) || typeof delta !== 'number' || !Number.isInteger(delta) || Math.abs(delta) > 2000) {
      return invalid(res, { deltaMl: 'Quantité invalide.' })
    }
    const total = Math.min(10_000, Math.max(0, (account.water.get(body.date) ?? 0) + delta))
    account.water.set(body.date, total)
    return send(res, 200, { waterMl: String(total) })
  }

  if (path === '/api/v1/activities' && method === 'POST') {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const errors: Record<string, string> = {}
    if (name.length < 1 || name.length > 80) errors.name = 'Entre 1 et 80 caractères.'
    const kcal = bounded(body.kcal, 5_000_000n)
    if (!kcal) errors.kcal = 'Entre 0 et 5000 kcal.'
    if (!isCalendarDate(body.date)) errors.date = 'Date invalide.'
    if (Object.keys(errors).length || !kcal) return invalid(res, errors)
    const activity: Activity = { id: randomUUID(), date: body.date as string, name, kcal }
    account.activities.push(activity)
    return send(res, 201, activity)
  }
  const activityMatch = /^\/api\/v1\/activities\/([\w-]+)$/.exec(path)
  if (activityMatch && method === 'DELETE') {
    const before = account.activities.length
    account.activities = account.activities.filter((a) => a.id !== activityMatch[1])
    return account.activities.length < before ? send(res, 204) : fail(res, 404, 'not_found', 'Activité introuvable.')
  }

  return fail(res, 404, 'not_found', 'Ressource introuvable.')
}

function seedFoods(): Food[] {
  // Rounded reference values per 100 g: kcal, protein, carbs, fat.
  const rows: [string, string, string, string, string][] = [
    ['Banane', '90', '1.1', '20', '0.3'],
    ["Flocons d'avoine", '372', '13.5', '58.7', '7'],
    ['Skyr nature', '63', '11', '4', '0.2'],
    ['Riz basmati cuit', '130', '2.7', '28', '0.3'],
    ['Blanc de poulet cuit', '157', '31', '0', '3.6'],
    ['Huile d’olive', '899', '0', '0', '99.9'],
  ]
  return rows.map(([name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g]) => ({
    id: randomUUID(),
    name,
    kcalPer100g,
    proteinPer100g,
    carbsPer100g,
    fatPer100g,
  }))
}

export function mockApi(): Plugin {
  return {
    name: 'kalo-mock-api',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  }
}
