import { useState } from 'react'
import { errorMessage } from '../../shared/api'
import { GlassIcon } from '../../shared/icons'
import { tap } from '../../shared/toast'
import { changeWater } from './api'

const GLASS_ML = 250

type Props = { date: string; waterMl: string; goalMl: string; onChanged: () => void }

export function WaterCard({ date, waterMl, goalMl, onChanged }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const drunk = Math.floor(Number(waterMl) / GLASS_ML)
  const glasses = Math.min(16, Math.max(drunk + 1, Math.ceil(Number(goalMl) / GLASS_ML)))

  // Tapping glass n sets the level to n glasses; tapping the last full glass empties it.
  const pour = async (n: number) => {
    const target = n === drunk ? n - 1 : n
    setBusy(true)
    setError(null)
    try {
      tap(8)
      await changeWater(date, (target - drunk) * GLASS_ML)
      onChanged()
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card water" aria-labelledby="water-title">
      <div className="card__head">
        <h2 id="water-title">Hydratation</h2>
        <p className="muted">Objectif {(Number(goalMl) / 1000).toLocaleString('fr-FR')} L</p>
      </div>
      <p className="water__total">
        {(Number(waterMl) / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} <span className="water__unit">L</span>
      </p>
      <div className="glasses" role="group" aria-label={`Verres de ${GLASS_ML} ml`}>
        {Array.from({ length: glasses }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className="glass"
            disabled={busy}
            aria-pressed={n <= drunk}
            aria-label={n <= drunk ? `Verre ${n} bu` : `Boire un verre (${n})`}
            onClick={() => void pour(n)}
          >
            <GlassIcon full={n <= drunk} />
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  )
}
