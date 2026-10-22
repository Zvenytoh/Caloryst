import { describe, expect, it } from 'vitest'
import { formatAmount, formatDay, formatKcal, formatWhole, shiftDate, toDecimal } from './format'

// French number formatting groups thousands with a narrow no-break space.
const NNBSP = ' '

describe('number formatting', () => {
  it('formats kcal with at most one decimal and French separators', () => {
    expect(formatKcal('94.7625')).toBe('94,8')
    expect(formatKcal('2260')).toBe(`2${NNBSP}260`)
  })

  it('rounds whole numbers for headline figures', () => {
    expect(formatWhole('2096.8')).toBe(`2${NNBSP}097`)
  })

  it('keeps two decimals for micronutrients', () => {
    expect(formatAmount('0.36')).toBe('0,36')
    expect(formatAmount('0.033')).toBe('0,03')
  })
})

describe('decimal input', () => {
  it('accepts a French comma and trims spaces', () => {
    expect(toDecimal(' 12,5 ')).toBe('12.5')
  })
})

describe('calendar dates', () => {
  it('shifts across month and year boundaries', () => {
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('names the day in French with a capital letter', () => {
    expect(formatDay('2026-10-22')).toBe('Jeudi 22 octobre')
  })
})
