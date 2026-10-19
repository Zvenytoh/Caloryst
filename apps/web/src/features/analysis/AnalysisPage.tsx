import { useEffect, useState } from 'react'
import { errorMessage } from '../../shared/api'
import { formatAmount, formatDay, formatKcal, formatWhole, today } from '../../shared/format'
import { AlertIcon, CheckIcon } from '../../shared/icons'
import { GROUP_LABEL, NUTRIENTS, nutrientInfo, type NutrientGroup } from '../../shared/nutrients'
import { fetchAnalysis, type Analysis, type Finding, type NutrientRow, type Objective } from './api'

const OBJECTIVE_LABEL: Record<Objective, string> = {
  lose_fat: 'Perte de gras',
  maintain: 'Maintien',
  gain_muscle: 'Prise de muscle',
}

const range = (f: Finding, unit: string) =>
  f.min && f.max ? `${formatWhole(f.min)}–${formatWhole(f.max)} ${unit}` : f.min ? `≥ ${formatWhole(f.min)} ${unit}` : `≤ ${formatWhole(f.max ?? '0')} ${unit}`

/** Plain-language reading of a finding; values come from the server. */
function message(f: Finding): string {
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

const STATUS_LABEL = { good: 'OK', low: 'Insuffisant', high: 'Trop élevé' } as const

function NutrientBar({ row, scope }: { row: NutrientRow; scope: 'day' | 'week' }) {
  const info = nutrientInfo(row.key)
  const amount = scope === 'day' ? row.dayAmount : row.weekAverage
  const known = scope === 'day' ? row.dayKnown : row.weekKnown
  const total = scope === 'day' ? row.dayTotal : row.weekTotal
  const ref = Number(row.reference.amount)
  const pct = ref > 0 ? (Number(amount) / ref) * 100 : 0
  const limit = row.reference.kind === 'atMost'
  const tone = known === 0 ? 'unknown' : limit ? (pct > 100 ? 'bad' : 'good') : pct >= 100 ? 'good' : pct >= 60 ? 'mid' : 'bad'
  return (
    <li className="nutrient">
      <div className="nutrient__head">
        <span className="nutrient__name">{info?.label ?? row.key}</span>
        <span className="nutrient__value">
          {known === 0 ? '—' : `${formatAmount(amount)} ${info?.unit ?? ''}`}
          <span className="muted">
            {' '}
            / {limit ? '≤ ' : ''}
            {formatAmount(row.reference.amount)} {info?.unit}
          </span>
        </span>
      </div>
      <span className={`bar bar--${tone}`} role="img" aria-label={known === 0 ? 'Donnée inconnue' : `${Math.round(pct)} % du repère`}>
        <span className="bar__fill" style={{ inlineSize: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="muted nutrient__meta">
        {total === 0
          ? 'Aucune portion'
          : known === total
            ? `${Math.round(pct)} % du repère`
            : `${known === 0 ? 'Non renseigné' : `${Math.round(pct)} % du repère`} · données pour ${known}/${total} portions`}
      </span>
    </li>
  )
}

export function AnalysisPage({ onEditProfile }: { onEditProfile: () => void }) {
  const [data, setData] = useState<Analysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<'day' | 'week'>('week')

  useEffect(() => {
    const controller = new AbortController()
    fetchAnalysis(today(), controller.signal)
      .then(setData)
      .catch((err: unknown) => !controller.signal.aborted && setError(errorMessage(err)))
    return () => controller.abort()
  }, [])

  const groups = (['quality', 'vitamins', 'minerals'] as NutrientGroup[]).map((g) => ({
    group: g,
    rows: data?.nutrients.filter((n) => NUTRIENTS.some((m) => m.key === n.key && m.group === g)) ?? [],
  }))
  const profile = data?.profile.profile
  const rec = data?.profile.recommendation
  const split = data?.energySplit

  return (
    <div className="page-body">
      <header className="day-head">
        <div>
          <h1 className="day-head__title">Analyse</h1>
          {data && (
            <p className="muted">
              7 derniers jours · du {formatDay(data.from).toLowerCase()} au {formatDay(data.to).toLowerCase()}
            </p>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      )}
      {!data && !error && <div className="skeleton skeleton--summary" aria-busy="true" aria-label="Chargement de l’analyse" />}

      {data && (
        <div className="dashboard">
          <div className="dashboard__main">
            <section className="card objective-card" aria-labelledby="objective-title">
              <h2 id="objective-title" className="card__title">
                {profile ? `Objectif : ${OBJECTIVE_LABEL[profile.objective]}` : 'Ton objectif'}
              </h2>
              {profile && rec ? (
                <p className="muted">
                  Maintenance estimée {formatWhole(rec.maintenanceKcal)} kcal · objectif du jour {formatWhole(data.goals.kcal)} kcal
                  {data.goals.kcal !== rec.goals.kcal && ` (recommandé : ${formatWhole(rec.goals.kcal)} kcal)`}
                </p>
              ) : (
                <div className="objective-card__cta">
                  <p className="muted">Renseigne ton profil (âge, taille, poids, activité, objectif) pour une analyse personnalisée.</p>
                  <button type="button" className="button" onClick={onEditProfile}>
                    Compléter mon profil
                  </button>
                </div>
              )}
              <div className="tiles">
                <div className="tile">
                  <span className="tile__label">Énergie nette / jour</span>
                  <span className="tile__value">{formatWhole(data.averages.netKcal)}</span>
                  <span className="muted">sur {formatWhole(data.goals.kcal)} kcal</span>
                </div>
                <div className="tile">
                  <span className="tile__label">Protéines / jour</span>
                  <span className="tile__value">{formatWhole(data.averages.proteinG)} g</span>
                  <span className="muted">{data.averages.proteinPerKg ? `${formatKcal(data.averages.proteinPerKg)} g/kg` : `sur ${formatWhole(data.goals.proteinG)} g`}</span>
                </div>
                <div className="tile">
                  <span className="tile__label">Jours renseignés</span>
                  <span className="tile__value">
                    {data.daysLogged}/{data.periodDays}
                  </span>
                  <span className="muted">avec au moins une portion</span>
                </div>
              </div>
              {split && (
                <div className="split" aria-label="Répartition de l’énergie">
                  <div className="split__bar">
                    <span style={{ flexGrow: Number(split.proteinPct), background: 'var(--protein)' }} />
                    <span style={{ flexGrow: Number(split.carbsPct), background: 'var(--carbs)' }} />
                    <span style={{ flexGrow: Number(split.fatPct), background: 'var(--fat)' }} />
                  </div>
                  <ul className="split__legend">
                    <li>
                      <i style={{ background: 'var(--protein)' }} /> Protéines {formatKcal(split.proteinPct)} %
                    </li>
                    <li>
                      <i style={{ background: 'var(--carbs)' }} /> Glucides {formatKcal(split.carbsPct)} %
                    </li>
                    <li>
                      <i style={{ background: 'var(--fat)' }} /> Lipides {formatKcal(split.fatPct)} %
                    </li>
                  </ul>
                </div>
              )}
            </section>

            <section className="card" aria-labelledby="findings-title">
              <h2 id="findings-title" className="card__title">
                Points d’attention
              </h2>
              <ul className="findings">
                {[...data.findings]
                  .sort((a, b) => Number(a.status === 'good') - Number(b.status === 'good'))
                  .map((f) => (
                    <li key={f.topic} className={`finding finding--${f.status}`}>
                      <span className="finding__icon">{f.status === 'good' ? <CheckIcon size={18} /> : <AlertIcon size={18} />}</span>
                      <span>
                        <strong className="finding__status">{STATUS_LABEL[f.status]}</strong> {message(f)}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          </div>

          <section className="card dashboard__side" aria-labelledby="micros-title">
            <div className="card__head">
              <h2 id="micros-title">Nutriments</h2>
              <div className="segmented segmented--small" role="group" aria-label="Période">
                {(['day', 'week'] as const).map((s) => (
                  <button key={s} type="button" className="segmented__button" aria-pressed={scope === s} onClick={() => setScope(s)}>
                    {s === 'day' ? 'Aujourd’hui' : 'Moyenne 7 j'}
                  </button>
                ))}
              </div>
            </div>
            {groups.map((g) => (
              <div key={g.group} className="nutrient-group">
                <h3>{GROUP_LABEL[g.group]}</h3>
                <ul className="nutrients">
                  {g.rows.map((row) => (
                    <NutrientBar key={row.key} row={row} scope={scope} />
                  ))}
                </ul>
              </div>
            ))}
            <p className="muted fine-print">
              Repères indicatifs pour adultes (ANSES, EFSA ; OMS pour le sel), {profile ? 'adaptés à ton sexe' : 'valeurs hautes sans profil'}. Une valeur
              absente d’un aliment n’est pas comptée.
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
