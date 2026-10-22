import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Food } from './api'
import { FoodPicker } from './FoodPicker'

const food = (id: string, name: string, source: Food['source'], brand: string | null = null) => ({
  id,
  name,
  source,
  brand,
  kcalPer100g: '130',
  proteinPer100g: '2.7',
  carbsPer100g: '28',
  fatPer100g: '0.3',
  details: {},
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('FoodPicker', () => {
  it('searches once typing pauses and labels each result with its source', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ foods: [food('1', 'Riz blanc, cuit', 'ciqual'), food('2', 'Mon riz', 'user')] }))
    render(<FoodPicker query="riz" onQueryChange={() => {}} selected={null} onSelect={() => {}} />)
    expect(fetch).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0]?.[0])).toBe('/api/v1/foods?q=riz')
    expect(screen.getByText('Riz blanc, cuit')).toBeTruthy()
    expect(screen.getByText('CIQUAL')).toBeTruthy()
    expect(screen.getByText('Mes aliments')).toBeTruthy()
  })

  it('selects a product found by barcode', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ foods: [] }))
    const onSelect = vi.fn()
    render(<FoodPicker query="" onQueryChange={() => {}} selected={null} onSelect={onSelect} />)
    await act(() => vi.advanceTimersByTimeAsync(300))

    fetch.mockResolvedValueOnce(json(food('9', 'Pâte à tartiner', 'openfoodfacts', 'Marque')))
    fireEvent.change(screen.getByLabelText('Code-barres'), { target: { value: '30176-204 22003' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    })
    expect(String(fetch.mock.calls[1]?.[0])).toBe('/api/v1/foods/barcode/3017620422003')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '9', source: 'openfoodfacts' }))
    expect(screen.getByText('Open Food Facts')).toBeTruthy()
  })

  it('explains when Open Food Facts is busy', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ foods: [] }))
    render(<FoodPicker query="skyr" onQueryChange={() => {}} selected={null} onSelect={() => {}} />)
    await act(() => vi.advanceTimersByTimeAsync(300))
    fetch.mockResolvedValueOnce(json({ code: 'busy', message: 'Trop de recherches Open Food Facts : réessayez dans une minute.' }, 429))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Chercher sur Open Food Facts' }))
    })
    expect(screen.getByRole('alert').textContent).toContain('réessayez dans une minute')
  })
})
