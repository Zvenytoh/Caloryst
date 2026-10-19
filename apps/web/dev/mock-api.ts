import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'

// shortcut: in-memory stand-in for the planned Rust API (docs/ARCHITECTURE.md §8), dev and preview only.
// Replace with a proxy to the real API once it exists. Data is lost on restart.

type Food = { id: string; name: string; kcalPer100g: string }
type Entry = { id: string; date: string; foodName: string; grams: string; kcalPer100g: string }
type Account = { displayName: string; foods: Food[]; entries: Entry[] }

const COOKIE = 'caloryst_dev_session'
const accounts = new Map<string, Account>()

const DECIMAL = /^\d{1,7}(\.\d{1,3})?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Parses a decimal string into thousandths, or null when malformed. */
export function toMilli(value: unknown): bigint | null {
  if (typeof value !== 'string' || !DECIMAL.test(value)) return null
  const [whole = '0', frac = ''] = value.split('.')
  return BigInt(whole) * 1000n + BigInt(frac.padEnd(3, '0'))
}

/** Energy of all portions, rounded half away from zero to one decimal place. */
export function totalKcal(portions: { grams: string; kcalPer100g: string }[]): string {
  // grams(milli) * density(milli) / 100 = kcal in millionths; sum unrounded, round once.
  const micro = portions.reduce((sum, p) => sum + (toMilli(p.grams) ?? 0n) * (toMilli(p.kcalPer100g) ?? 0n), 0n) / 100n
  const tenths = (micro + 50_000n) / 100_000n
  return `${tenths / 10n}.${tenths % 10n}`
}

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

function entryDto(e: Entry) {
  return { id: e.id, foodName: e.foodName, grams: e.grams, kcalPer100g: e.kcalPer100g, kcal: totalKcal([e]) }
}

function validGrams(value: unknown): value is string {
  const m = toMilli(value)
  return m !== null && m > 0n && m <= 5_000_000n
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
    accounts.set(id, { displayName: 'Dan', foods: seedFoods(), entries: [] })
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

  if (path === '/api/v1/foods' && method === 'GET') {
    return send(res, 200, { foods: [...account.foods].sort((a, b) => a.name.localeCompare(b.name, 'fr')) })
  }
  if (path === '/api/v1/foods' && method === 'POST') {
    const body = await readJson(req)
    if (!body) return fail(res, 400, 'malformed', 'Requête invalide.')
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const density = toMilli(body.kcalPer100g)
    const errors: Record<string, string> = {}
    if (name.length < 1 || name.length > 120) errors.name = 'Entre 1 et 120 caractères.'
    if (density === null || density > 900_000n) errors.kcalPer100g = 'Entre 0 et 900 kcal, 3 décimales maximum.'
    if (Object.keys(errors).length) return fail(res, 422, 'validation', 'Vérifiez les champs.', errors)
    const food = { id: randomUUID(), name, kcalPer100g: body.kcalPer100g as string }
    account.foods.push(food)
    return send(res, 201, food)
  }

  if (path === '/api/v1/diary' && method === 'GET') {
    const date = url.searchParams.get('date')
    if (!isCalendarDate(date)) return fail(res, 400, 'malformed', 'Date invalide.')
    const entries = account.entries.filter((e) => e.date === date)
    return send(res, 200, { date, entries: entries.map(entryDto), totalKcal: totalKcal(entries) })
  }
  if (path === '/api/v1/diary/entries' && method === 'POST') {
    const body = await readJson(req)
    if (!body) return fail(res, 400, 'malformed', 'Requête invalide.')
    const errors: Record<string, string> = {}
    if (!validGrams(body.grams)) errors.grams = 'Entre 0 et 5000 g, 3 décimales maximum.'
    if (!isCalendarDate(body.date)) errors.date = 'Date invalide.'
    if (Object.keys(errors).length) return fail(res, 422, 'validation', 'Vérifiez les champs.', errors)
    const food = account.foods.find((f) => f.id === body.foodId)
    if (!food) return fail(res, 404, 'not_found', 'Aliment introuvable.')
    const entry: Entry = {
      id: randomUUID(),
      date: body.date as string,
      foodName: food.name,
      grams: body.grams as string,
      kcalPer100g: food.kcalPer100g,
    }
    account.entries.push(entry)
    return send(res, 201, entryDto(entry))
  }

  const match = /^\/api\/v1\/diary\/entries\/([\w-]+)$/.exec(path)
  const entry = match ? account.entries.find((e) => e.id === match[1]) : undefined
  if (match && !entry) return fail(res, 404, 'not_found', 'Entrée introuvable.')
  if (entry && method === 'PATCH') {
    const body = await readJson(req)
    if (!body) return fail(res, 400, 'malformed', 'Requête invalide.')
    if (!validGrams(body.grams)) {
      return fail(res, 422, 'validation', 'Vérifiez les champs.', { grams: 'Entre 0 et 5000 g, 3 décimales maximum.' })
    }
    entry.grams = body.grams
    return send(res, 200, entryDto(entry))
  }
  if (entry && method === 'DELETE') {
    account.entries = account.entries.filter((e) => e !== entry)
    return send(res, 204)
  }
  return fail(res, 404, 'not_found', 'Ressource introuvable.')
}

function seedFoods(): Food[] {
  return [
    ['Banane', '90'],
    ["Flocons d'avoine", '372'],
    ['Skyr nature', '63'],
    ['Riz basmati cuit', '130'],
    ['Huile d’olive', '899'],
  ].map(([name = '', kcalPer100g = '']) => ({ id: randomUUID(), name, kcalPer100g }))
}

export function mockApi(): Plugin {
  return {
    name: 'caloryst-mock-api',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  }
}
