import { formatKcal, formatWhole } from '../../shared/format'
import type { Finding, Objective } from './api'

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  lose_fat: 'Perte de gras',
  maintain: 'Maintien',
  gain_muscle: 'Prise de muscle',
}

const range = (f: Finding, unit: string) =>
  f.min && f.max ? `${formatWhole(f.min)}–${formatWhole(f.max)} ${unit}` : f.min ? `≥ ${formatWhole(f.min)} ${unit}` : `≤ ${formatWhole(f.max ?? '0')} ${unit}`

/** Plain-language reading of a finding; values come from the server. */
export function message(f: Finding): string {
  const v = formatKcal(f.value)
  const ok = f.status === 'good'
  switch (f.topic) {
    case 'logging':
      return ok ? `${v} jours renseignés sur 7 : l’analyse est fiable.` : `Seulement ${v} jour(s) renseigné(s) sur 7 : l’analyse sera plus fiable à partir de 4 jours.`
    case 'energy':
      return ok
        ? `Énergie nette moyenne de ${formatWhole(f.value)} kcal : dans ta cible (${range(f, 'kcal')}).`
        : `Énergie nette moyenne de ${formatWhole(f.value)} kcal : ${f.status === 'low' ? 'sous' : 'au-dessus de'} ta cible (${range(f, 'kcal')}).`
    case 'protein':
      return ok ? `${v} g de protéines par jour : objectif atteint.` : `${v} g de protéines par jour : sous ton objectif (${range(f, 'g')}).`
    case 'fat':
      return ok
        ? `Lipides à ${v} % de l’énergie : équilibré.`
        : f.status === 'low'
          ? `Lipides à ${v} % de l’énergie : moins de 20 %, ajoute de bonnes graisses (huiles, oléagineux, poissons gras).`
          : `Lipides à ${v} % de l’énergie : au-delà de 40 %.`
    case 'carbs':
      return ok ? `Glucides à ${v} % de l’énergie : équilibré.` : `Glucides à ${v} % de l’énergie : ${f.status === 'low' ? 'moins de 35 %' : 'plus de 60 %'}.`
    case 'fiber':
      return ok ? `${v} g de fibres par jour : bien.` : `${v} g de fibres par jour : vise 25 à 30 g (légumes, légumineuses, céréales complètes).`
    case 'sugars':
      return ok ? `${v} g de sucres par jour : sous le repère de 100 g.` : `${v} g de sucres par jour : au-delà du repère de 100 g.`
    case 'saturatedFat':
      return ok ? `Graisses saturées à ${v} % de l’énergie : sous le repère de 12 %.` : `Graisses saturées à ${v} % de l’énergie : au-delà du repère de 12 %.`
    case 'salt':
      return ok ? `${v} g de sel par jour : sous le repère de 5 g.` : `${v} g de sel par jour : au-delà du repère de 5 g.`
    default:
      return v
  }
}

export const STATUS_LABEL = { good: 'OK', low: 'Insuffisant', high: 'Trop élevé' } as const
