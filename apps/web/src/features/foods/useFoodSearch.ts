import { useEffect, useState } from 'react'
import { errorMessage } from '../../shared/api'
import { searchFoods, type Food } from './api'

const DEBOUNCE_MS = 250

/**
 * The user's foods and catalog matches for `query`, fetched once typing pauses.
 * A newer query aborts the previous request, so results never arrive out of order.
 */
export function useFoodSearch(query: string, version = 0): { results: Food[] | null; error: string | null } {
  const [state, setState] = useState<{ results: Food[] | null; error: string | null }>({ results: null, error: null })

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchFoods(query, controller.signal)
        .then((results) => setState({ results, error: null }))
        .catch((err: unknown) => !controller.signal.aborted && setState((s) => ({ ...s, error: errorMessage(err) })))
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, version])

  return state
}
