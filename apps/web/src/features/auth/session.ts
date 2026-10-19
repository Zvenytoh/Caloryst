import { api, isObject, str } from '../../shared/api'

export type Session = { authenticated: false } | { authenticated: true; displayName: string }

export async function fetchSession(signal?: AbortSignal): Promise<Session> {
  const body = await api('/session', signal ? { signal } : {})
  if (!body || body.authenticated !== true) return { authenticated: false }
  return { authenticated: true, displayName: isObject(body.user) ? str(body.user, 'displayName') : '' }
}

export async function signOut(): Promise<void> {
  await api('/auth/logout', { method: 'POST' })
}

/** Opens the sign-in page: VITE_SIGN_IN_URL (e.g. the Better Auth login page), or the dev login. */
export function signIn(): void {
  window.location.assign(import.meta.env.VITE_SIGN_IN_URL || '/api/v1/auth/login')
}
