/** Labels and units for the detailed nutrients the API knows (keys end with their unit). */
export const NUTRIENTS = [
  { key: 'fiberG', label: 'Fibres', unit: 'g', group: 'quality' },
  { key: 'sugarsG', label: 'Sucres', unit: 'g', group: 'quality' },
  { key: 'saturatedFatG', label: 'Acides gras saturés', unit: 'g', group: 'quality' },
  { key: 'saltG', label: 'Sel', unit: 'g', group: 'quality' },
  { key: 'vitaminAUg', label: 'Vitamine A', unit: 'µg', group: 'vitamins' },
  { key: 'vitaminCMg', label: 'Vitamine C', unit: 'mg', group: 'vitamins' },
  { key: 'vitaminDUg', label: 'Vitamine D', unit: 'µg', group: 'vitamins' },
  { key: 'vitaminEMg', label: 'Vitamine E', unit: 'mg', group: 'vitamins' },
  { key: 'folateUg', label: 'Vitamine B9 (folates)', unit: 'µg', group: 'vitamins' },
  { key: 'vitaminB12Ug', label: 'Vitamine B12', unit: 'µg', group: 'vitamins' },
  { key: 'calciumMg', label: 'Calcium', unit: 'mg', group: 'minerals' },
  { key: 'ironMg', label: 'Fer', unit: 'mg', group: 'minerals' },
  { key: 'magnesiumMg', label: 'Magnésium', unit: 'mg', group: 'minerals' },
  { key: 'potassiumMg', label: 'Potassium', unit: 'mg', group: 'minerals' },
  { key: 'zincMg', label: 'Zinc', unit: 'mg', group: 'minerals' },
] as const

export type NutrientKey = (typeof NUTRIENTS)[number]['key']
export type NutrientGroup = (typeof NUTRIENTS)[number]['group']

export const GROUP_LABEL: Record<NutrientGroup, string> = {
  quality: 'Qualité',
  vitamins: 'Vitamines',
  minerals: 'Minéraux',
}

export const nutrientInfo = (key: string) => NUTRIENTS.find((n) => n.key === key)
