import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageBoundary } from '../app/PageBoundary'
import { dismiss, toast } from './toast'
import { Toaster } from './Toaster'

afterEach(() => {
  act(() => {
    // Clear the shared toast store between tests.
    for (let id = 0; id < 100; id++) dismiss(id)
  })
  cleanup()
  vi.restoreAllMocks()
})

describe('Toaster', () => {
  it('runs the action and removes the toast', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    render(<Toaster />)
    act(() => void toast('Banane, 100 g ajouté au déjeuner', { label: 'Annuler', run }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Annuler' })))
    expect(run).toHaveBeenCalledOnce()
    expect(screen.queryByText(/Banane/)).toBeNull()
  })

  it('says so when the undo fails instead of failing silently', async () => {
    render(<Toaster />)
    act(() => void toast('Banane, 100 g ajouté', { label: 'Annuler', run: () => Promise.reject(new Error('offline')) }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Annuler' })))
    expect(screen.getByText(/Annuler impossible/)).toBeTruthy()
  })
})

describe('PageBoundary', () => {
  it('replaces a page that fails to load with a reload prompt', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Broken = () => {
      throw new Error('Failed to fetch dynamically imported module')
    }
    render(
      <PageBoundary>
        <Broken />
      </PageBoundary>,
    )
    expect(screen.getByRole('alert').textContent).toContain('n’a pas pu se charger')
    expect(screen.getByRole('button', { name: 'Recharger' })).toBeTruthy()
  })
})
