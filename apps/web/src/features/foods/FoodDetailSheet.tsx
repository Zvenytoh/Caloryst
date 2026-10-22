import { formatAmount, formatKcal } from '../../shared/format'
import { CloseIcon } from '../../shared/icons'
import { GROUP_LABEL, NUTRIENTS, type NutrientGroup } from '../../shared/nutrients'
import { useSheet } from '../../shared/useSheet'
import { SOURCE_LABEL, type Food } from './api'

const ATTRIBUTION: Record<Food['source'], string> = {
  user: 'Aliment créé par vous.',
  ciqual: 'Source : table CIQUAL 2025 (ANSES), Licence Ouverte Etalab 2.0.',
  openfoodfacts: 'Source : Open Food Facts (ODbL), données collaboratives à vérifier sur l’emballage.',
}

/** Every known value of a food per 100 g; unknown values are shown as such, never as 0. */
export function FoodDetailSheet({ food, onClose }: { food: Food; onClose: () => void }) {
  const { dialogProps, grabberProps, close } = useSheet()
  const detail = (key: string) => food.details[key]
  const value = (key: string, unit: string) => {
    const v = detail(key)
    return v === undefined ? <span className="muted">non renseigné</span> : `${formatAmount(v)} ${unit}`
  }
  const known = NUTRIENTS.filter((n) => detail(n.key) !== undefined).length

  return (
    <dialog {...dialogProps} className="sheet" aria-labelledby="food-title" onClose={onClose}>
      <div className="sheet__grabber" aria-hidden="true" {...grabberProps} />
      <div className="sheet__head" {...grabberProps}>
        <div>
          <h2 id="food-title">{food.name}</h2>
          <p className="muted">
            <span className={`source source--${food.source}`}>{SOURCE_LABEL[food.source]}</span>
            {food.brand && ` ${food.brand} ·`} pour 100 g
          </p>
        </div>
        <button type="button" className="icon-button" aria-label="Fermer" onClick={close} onPointerDown={(e) => e.stopPropagation()}>
          <CloseIcon size={20} />
        </button>
      </div>
      <div className="sheet__body">
        <dl className="facts">
          <div className="facts__row facts__row--energy">
            <dt>Énergie</dt>
            <dd>{formatKcal(food.kcalPer100g)} kcal</dd>
          </div>
          <div className="facts__row">
            <dt>Protéines</dt>
            <dd>{formatAmount(food.proteinPer100g)} g</dd>
          </div>
          <div className="facts__row">
            <dt>Glucides</dt>
            <dd>{formatAmount(food.carbsPer100g)} g</dd>
          </div>
          <div className="facts__row facts__row--sub">
            <dt>dont sucres</dt>
            <dd>{value('sugarsG', 'g')}</dd>
          </div>
          <div className="facts__row">
            <dt>Lipides</dt>
            <dd>{formatAmount(food.fatPer100g)} g</dd>
          </div>
          <div className="facts__row facts__row--sub">
            <dt>dont acides gras saturés</dt>
            <dd>{value('saturatedFatG', 'g')}</dd>
          </div>
          <div className="facts__row">
            <dt>Fibres</dt>
            <dd>{value('fiberG', 'g')}</dd>
          </div>
          <div className="facts__row">
            <dt>Sel</dt>
            <dd>{value('saltG', 'g')}</dd>
          </div>
        </dl>
        {(['vitamins', 'minerals'] as NutrientGroup[]).map((group) => (
          <section key={group} aria-label={GROUP_LABEL[group]}>
            <h3 className="facts__heading">{GROUP_LABEL[group]}</h3>
            <dl className="facts">
              {NUTRIENTS.filter((n) => n.group === group).map((n) => (
                <div key={n.key} className="facts__row">
                  <dt>{n.label}</dt>
                  <dd>{value(n.key, n.unit)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="muted fine-print">
          {known} détail{known > 1 ? 's' : ''} sur {NUTRIENTS.length} renseigné{known > 1 ? 's' : ''}. {ATTRIBUTION[food.source]}
        </p>
      </div>
    </dialog>
  )
}
