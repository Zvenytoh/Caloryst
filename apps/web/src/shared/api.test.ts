import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from './api'

const respond = (status: number, body?: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )

afterEach(() => vi.restoreAllMocks())

describe('api client', () => {
  it('returns parsed JSON and sends JSON bodies to /api/v1', async () => {
    const fetch = respond(200, { ok: true })
    await expect(api('/foods', { method: 'POST', body: '{}' })).resolves.toEqual({ ok: true })
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe('/api/v1/foods')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(init?.credentials).toBe('same-origin')
  })

  it('returns null for 204 No Content', async () => {
    respond(204)
    await expect(api('/diary/entries/x', { method: 'DELETE' })).resolves.toBeNull()
  })

  it('turns the error envelope into an ApiError with field errors', async () => {
    respond(422, { code: 'validation', message: 'Vérifiez les champs.', fieldErrors: { grams: 'Entre 0 et 5000 g.', bad: 3 } })
    const err = await api('/diary/entries', { method: 'POST', body: '{}' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 422, message: 'Vérifiez les champs.', fieldErrors: { grams: 'Entre 0 et 5000 g.' } })
  })

  it('reports network failures as status 0', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api('/session')).rejects.toMatchObject({ status: 0 })
  })

  it('rejects a non-object success body', async () => {
    respond(200, [1, 2])
    await expect(api('/foods')).rejects.toBeInstanceOf(ApiError)
  })
})
