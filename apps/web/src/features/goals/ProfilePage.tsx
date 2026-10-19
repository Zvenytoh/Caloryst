import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api'
import { formatWhole, toDecimal } from '../../shared/format'
import { fetchProfile, saveProfile, type ActivityLevel, type Objective, type Profile, type ProfileState } from '../analysis/api'
import type { Goals } from '../diary/api'
import { fetchGoals, saveGoals } from './api'

const GOAL_FIELDS: { key: keyof Goals; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Énergie', unit: 'kcal' },
  { key: 'carbsG', label: 'Glucides', unit: 'g' },
  { key: 'proteinG', label: 'Protéines', unit: 'g' },
  { key: 'fatG', label: 'Lipides', unit: 'g' },
  { key: 'waterMl', label: 'Eau', unit: 'ml' },
]

const OBJECTIVES: { value: Objective; label: string; hint: string }[] = [
  { value: 'lose_fat', label: 'Perte de gras', hint: '−20 % sur la maintenance, protéines élevées' },
  { value: 'maintain', label: 'Maintien', hint: 'Énergie à la maintenance' },
  { value: 'gain_muscle', label: 'Prise de muscle', hint: '+10 % sur la maintenance' },
]

const ACTIVITIES: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sédentaire (peu ou pas de sport)' },
  { value: 'light', label: 'Légère (1 à 3 séances par semaine)' },
  { value: 'moderate', label: 'Modérée (3 à 5 séances par semaine)' },
  { value: 'active', label: 'Élevée (6 à 7 séances par semaine)' },
  { value: 'very_active', label: 'Très élevée (sport intense, travail physique)' },
]

const EMPTY_PROFILE: Profile = { sex: 'female', birthYear: 1995, heightCm: '', weightKg: '', activity: 'moderate', objective: 'maintain' }

type Props = { displayName: string; onSignOut: () => void }

export function ProfilePage({ displayName, onSignOut }: Props) {
  const [state, setState] = useState<ProfileState | null>(null)
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE)
  const [goals, setGoals] = useState<Goals | null>(null)
  const [busy, setBusy] = useState<'profile' | 'goals' | 'apply' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([fetchProfile(controller.signal), fetchGoals(controller.signal)])
      .then(([p, g]) => {
        setState(p)
        if (p.profile) setProfile(p.profile)
        setGoals(g)
      })
      .catch((err: unknown) => !controller.signal.aborted && setErrors({ form: errorMessage(err) }))
    return () => controller.abort()
  }, [])

  const run = async (kind: 'profile' | 'goals' | 'apply', action: () => Promise<string>) => {
    setBusy(kind)
    setErrors({})
    setNotice(null)
    try {
      setNotice(await action())
    } catch (err: unknown) {
      setErrors(err instanceof ApiError ? { form: err.message, ...err.fieldErrors } : { form: errorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const submitProfile = (e: FormEvent) => {
    e.preventDefault()
    void run('profile', async () => {
      setState(await saveProfile({ ...profile, heightCm: toDecimal(profile.heightCm), weightKg: toDecimal(profile.weightKg) }))
      return 'Profil enregistré. Tes besoins ont été recalculés.'
    })
  }

  const submitGoals = (e: FormEvent) => {
    e.preventDefault()
    if (!goals) return
    void run('goals', async () => {
      const normalized = Object.fromEntries(Object.entries(goals).map(([k, v]) => [k, toDecimal(v)])) as Goals
      setGoals(await saveGoals(normalized))
      return 'Objectifs enregistrés.'
    })
  }

  const recommendation = state?.recommendation
  const apply = () => {
    if (!recommendation) return
    void run('apply', async () => {
      setGoals(await saveGoals(recommendation.goals))
      return 'Objectifs recommandés appliqués.'
    })
  }

  const error = (key: string) =>
    errors[key] && (
      <span id={`${key}-error`} className="field-error">
        {errors[key]}
      </span>
    )

  return (
    <div className="page-body">
      <header className="day-head">
        <div>
          <h1 className="day-head__title">Profil</h1>
          <p className="muted">Connecté en tant que {displayName}</p>
        </div>
        <button type="button" className="button button--ghost button--small" onClick={onSignOut}>
          Se déconnecter
        </button>
      </header>

      {notice && (
        <p role="status" className="notice notice--ok">
          {notice}
        </p>
      )}
      {errors.form && (
        <p role="alert" className="notice notice--error">
          {errors.form}
        </p>
      )}

      <div className="dashboard">
        <section className="card dashboard__main" aria-labelledby="body-title">
          <h2 id="body-title" className="card__title">
            Mon profil
          </h2>
          {!state && !errors.form && <div className="skeleton" aria-busy="true" aria-label="Chargement du profil" />}
          {state && (
            <form className="profile-form" onSubmit={submitProfile} noValidate>
              <fieldset className="segmented">
                <legend className="field__label">Sexe</legend>
                {(['female', 'male'] as const).map((sex) => (
                  <label key={sex} className="segmented__option">
                    <input type="radio" name="sex" checked={profile.sex === sex} onChange={() => setProfile({ ...profile, sex })} />
                    <span>{sex === 'female' ? 'Femme' : 'Homme'}</span>
                  </label>
                ))}
              </fieldset>
              <div className="nutrition-grid nutrition-grid--3">
                <label className="field">
                  <span className="field__label">Année de naissance</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={String(profile.birthYear)}
                    onChange={(e) => setProfile({ ...profile, birthYear: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                    aria-invalid={Boolean(errors.birthYear)}
                    aria-describedby={errors.birthYear ? 'birthYear-error' : undefined}
                  />
                  {error('birthYear')}
                </label>
                <label className="field">
                  <span className="field__label">Taille (cm)</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="ex. 175"
                    value={profile.heightCm}
                    onChange={(e) => setProfile({ ...profile, heightCm: e.target.value })}
                    aria-invalid={Boolean(errors.heightCm)}
                    aria-describedby={errors.heightCm ? 'heightCm-error' : undefined}
                  />
                  {error('heightCm')}
                </label>
                <label className="field">
                  <span className="field__label">Poids (kg)</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="ex. 70,5"
                    value={profile.weightKg}
                    onChange={(e) => setProfile({ ...profile, weightKg: e.target.value })}
                    aria-invalid={Boolean(errors.weightKg)}
                    aria-describedby={errors.weightKg ? 'weightKg-error' : undefined}
                  />
                  {error('weightKg')}
                </label>
              </div>
              <label className="field">
                <span className="field__label">Activité physique</span>
                <select className="input" value={profile.activity} onChange={(e) => setProfile({ ...profile, activity: e.target.value as ActivityLevel })}>
                  {ACTIVITIES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="objectives">
                <legend className="field__label">Objectif</legend>
                {OBJECTIVES.map((o) => (
                  <label key={o.value} className="objective">
                    <input type="radio" name="objective" checked={profile.objective === o.value} onChange={() => setProfile({ ...profile, objective: o.value })} />
                    <span className="objective__label">{o.label}</span>
                    <span className="muted objective__hint">{o.hint}</span>
                  </label>
                ))}
              </fieldset>
              <div className="goals__actions">
                <button type="submit" className="button" disabled={busy !== null}>
                  {busy === 'profile' ? 'Enregistrement…' : 'Enregistrer le profil'}
                </button>
              </div>
            </form>
          )}
        </section>

        <div className="dashboard__side">
          <section className="card" aria-labelledby="needs-title">
            <h2 id="needs-title" className="card__title">
              Besoins estimés
            </h2>
            {recommendation ? (
              <>
                <dl className="needs">
                  <div>
                    <dt>Métabolisme de base</dt>
                    <dd>{formatWhole(recommendation.restingKcal)} kcal</dd>
                  </div>
                  <div>
                    <dt>Maintenance</dt>
                    <dd>{formatWhole(recommendation.maintenanceKcal)} kcal</dd>
                  </div>
                  <div className="needs__target">
                    <dt>Objectif</dt>
                    <dd>{formatWhole(recommendation.goals.kcal)} kcal</dd>
                  </div>
                  <div>
                    <dt>Protéines</dt>
                    <dd>{formatWhole(recommendation.goals.proteinG)} g</dd>
                  </div>
                  <div>
                    <dt>Glucides</dt>
                    <dd>{formatWhole(recommendation.goals.carbsG)} g</dd>
                  </div>
                  <div>
                    <dt>Lipides</dt>
                    <dd>{formatWhole(recommendation.goals.fatG)} g</dd>
                  </div>
                  <div>
                    <dt>Eau</dt>
                    <dd>{(Number(recommendation.goals.waterMl) / 1000).toLocaleString('fr-FR')} L</dd>
                  </div>
                </dl>
                <button type="button" className="button needs__apply" disabled={busy !== null} onClick={apply}>
                  {busy === 'apply' ? 'Application…' : 'Appliquer à mes objectifs'}
                </button>
                <p className="muted fine-print">Estimation Mifflin-St Jeor et repères généraux pour adultes, pas un avis médical.</p>
              </>
            ) : (
              <p className="muted">Renseigne ton profil pour obtenir tes besoins énergétiques et des objectifs adaptés.</p>
            )}
          </section>

          <section className="card" aria-labelledby="goals-title">
            <h2 id="goals-title" className="card__title">
              Objectifs quotidiens
            </h2>
            {goals && (
              <form className="goals__form" onSubmit={submitGoals} noValidate>
                {GOAL_FIELDS.map((f) => (
                  <label key={f.key} className="field">
                    <span className="field__label">
                      {f.label} ({f.unit})
                    </span>
                    <input
                      className="input"
                      inputMode="decimal"
                      value={goals[f.key]}
                      onChange={(e) => setGoals({ ...goals, [f.key]: e.target.value })}
                      aria-invalid={Boolean(errors[f.key])}
                      aria-describedby={errors[f.key] ? `${f.key}-error` : undefined}
                    />
                    {error(f.key)}
                  </label>
                ))}
                <div className="goals__actions">
                  <button type="submit" className="button" disabled={busy !== null}>
                    {busy === 'goals' ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
