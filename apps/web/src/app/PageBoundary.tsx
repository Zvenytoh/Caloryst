import { Component, type ReactNode } from 'react'

type State = { failed: boolean }

/**
 * Catches a page that fails to load or render (e.g. a code chunk missing after a deploy)
 * so the rest of the app stays usable.
 */
export class PageBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="notice notice--error page-error">
        <span>Cette page n’a pas pu se charger. Une nouvelle version de Kalo est peut-être disponible.</span>
        <button type="button" className="button button--small" onClick={() => window.location.reload()}>
          Recharger
        </button>
      </div>
    )
  }
}
