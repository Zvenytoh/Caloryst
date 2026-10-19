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

/** Starts the identity-provider sign-in flow (full-page redirect). */
export function signIn(): void {
  window.location.assign('/api/v1/auth/login')
}
