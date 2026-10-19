/** A failed API call, carrying the server's safe message and field errors when present. */
export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string>

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

type Json = Record<string, unknown>

export function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function str(obj: Json, key: string): string {
  const value = obj[key]
  if (typeof value !== 'string') throw new ApiError(0, 'Réponse du serveur inattendue.')
  return value
}

export function list(obj: Json, key: string): Json[] {
  const value = obj[key]
  if (!Array.isArray(value) || !value.every(isObject)) throw new ApiError(0, 'Réponse du serveur inattendue.')
  return value
}

/** Calls the Caloryst API. Resolves to parsed JSON (or null for 204) and throws ApiError otherwise. */
export async function api(path: string, init: RequestInit = {}): Promise<Json | null> {
  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'Connexion impossible. Vérifiez votre réseau.')
  }
  if (res.status === 204) return null
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message = isObject(body) && typeof body.message === 'string' ? body.message : 'Une erreur est survenue.'
    const fields = isObject(body) && isObject(body.fieldErrors) ? body.fieldErrors : {}
    const fieldErrors = Object.fromEntries(Object.entries(fields).filter((e): e is [string, string] => typeof e[1] === 'string'))
    throw new ApiError(res.status, message, fieldErrors)
  }
  if (!isObject(body)) throw new ApiError(res.status, 'Réponse du serveur inattendue.')
  return body
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Une erreur est survenue.'
}
