import { describe, expect, it } from 'vitest'
import type { Finding } from './api'
import { message } from './messages'

const finding = (f: Partial<Finding> & Pick<Finding, 'topic' | 'status' | 'value'>): Finding => ({ min: null, max: null, ...f })

describe('analysis messages', () => {
  it('explains an energy intake below the target range', () => {
    expect(message(finding({ topic: 'energy', status: 'low', value: '1500.0', min: '1980.0', max: '2420.0' }))).toBe(
      'Énergie nette moyenne de 1 500 kcal : sous ta cible (1 980–2 420 kcal).',
    )
  })

  it('suggests fibre sources when fibre is low', () => {
    expect(message(finding({ topic: 'fiber', status: 'low', value: '12.4', min: '25.0' }))).toContain('vise 25 à 30 g')
  })

  it('states limits for salt', () => {
    expect(message(finding({ topic: 'salt', status: 'high', value: '7.2', max: '5.0' }))).toBe('7,2 g de sel par jour : au-delà du repère de 5 g.')
  })

  it('encourages logging more days', () => {
    expect(message(finding({ topic: 'logging', status: 'low', value: '2.0', min: '4.0' }))).toContain('à partir de 4 jours')
  })
})
