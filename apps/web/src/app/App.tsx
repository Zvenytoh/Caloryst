import { useCallback, useEffect, useState } from 'react'
import { fetchSession, signIn, signOut } from '../features/auth/session'
import { Shell } from './Shell'
import { ApiError, errorMessage } from '../shared/api'
import { Logo } from '../shared/Logo'
import { useUpdate } from './pwa'

type State =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'error'; message: string }
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; displayName: string }

const channel = 'BroadcastChannel' in window ? new BroadcastChannel('kalo-session') : null

async function loadSession(): Promise<State> {
  try {
    const session = await fetchSession()
    return session.authenticated ? { kind: 'signedIn', displayName: session.displayName } : { kind: 'signedOut' }
  } catch (err: unknown) {
    return err instanceof ApiError && err.status === 0 ? { kind: 'offline' } : { kind: 'error', message: errorMessage(err) }
  }
}

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const update = useUpdate()
  const signedOut = useCallback(() => setState({ kind: 'signedOut' }), [])
  const revalidate = useCallback(() => void loadSession().then(setState), [])

  useEffect(() => {
    revalidate()
    const onVisible = () => document.visibilityState === 'visible' && revalidate()
    const onMessage = (e: MessageEvent) => e.data === 'signed-out' && setState({ kind: 'signedOut' })
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', revalidate)
    channel?.addEventListener('message', onMessage)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', revalidate)
      channel?.removeEventListener('message', onMessage)
    }
  }, [revalidate])

  const logout = async () => {
    try {
      await signOut()
      setState({ kind: 'signedOut' })
      channel?.postMessage('signed-out')
    } catch (err: unknown) {
      // Without the server's confirmation the session is still active; say so.
      setState({ kind: 'error', message: `Déconnexion impossible : ${errorMessage(err)}` })
    }
  }

  return (
    <>
      {update.available && (
        <div className="update" role="status">
          Une nouvelle version de Kalo est prête.
          <button type="button" className="button button--small" onClick={update.apply}>
            Mettre à jour
          </button>
        </div>
      )}
      {state.kind === 'signedIn' ? (
        <Shell displayName={state.displayName} onSignOut={logout} onUnauthenticated={signedOut} />
      ) : (
        <main className="welcome">
          <Logo size={72} />
          <h1>Kalo</h1>
          {state.kind === 'loading' && <p className="welcome__lead" aria-busy="true">Chargement…</p>}
          {state.kind === 'signedOut' && (
            <>
              <p className="welcome__lead">Calories, macros, eau et activités : votre journée, claire et précise, en un coup d’œil.</p>
              <button type="button" className="button button--large" onClick={signIn}>
                Se connecter
              </button>
            </>
          )}
          {(state.kind === 'offline' || state.kind === 'error') && (
            <div role="alert" className="welcome__lead">
              <p>{state.kind === 'offline' ? 'Kalo a besoin d’une connexion pour afficher votre journal.' : state.message}</p>
              <button type="button" className="button" onClick={revalidate}>
                Réessayer
              </button>
            </div>
          )}
        </main>
      )}
    </>
  )
}
