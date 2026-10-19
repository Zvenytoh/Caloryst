const kcalFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const gramsFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 })

/** Formats a server decimal string for display only; never used for calculations. */
export const formatKcal = (value: string) => kcalFormat.format(Number(value))
const wholeFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
export const formatWhole = (value: string) => wholeFormat.format(Number(value))
const amountFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
/** Detailed nutrient amounts keep two decimals (micrograms matter). */
export const formatAmount = (value: string) => amountFormat.format(Number(value))
export const formatGrams = (value: string) => gramsFormat.format(Number(value))

/** Today's calendar date in the browser's time zone, as YYYY-MM-DD. */
export function today(): string {
  const d = new Date()
  return toIsoDate(d)
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function shiftDate(date: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number)
  return toIsoDate(new Date(y, m - 1, d + days))
}

export function formatDay(date: string): string {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number)
  const label = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Normalizes a user-typed decimal ("12,5") to the API's decimal-string form ("12.5"). */
export const toDecimal = (input: string) => input.trim().replace(',', '.')
