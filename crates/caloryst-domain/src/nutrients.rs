//! Detailed nutrients per 100 g and indicative adult daily references.
//!
//! A missing value means "unknown", never zero: totals report how many portions
//! carried the value so partial data is visible.

use crate::{Invalid, Portion, Result, Sex, parse_decimal};
use rust_decimal::Decimal;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Nutrient {
    Fiber,
    Sugars,
    SaturatedFat,
    Salt,
    VitaminA,
    VitaminC,
    VitaminD,
    VitaminE,
    Folate,
    VitaminB12,
    Calcium,
    Iron,
    Magnesium,
    Potassium,
    Zinc,
}

/// Daily reference: a minimum to reach or a maximum not to exceed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reference {
    AtLeast(Decimal),
    AtMost(Decimal),
}

const fn d(v: i64) -> Decimal {
    Decimal::from_parts(v as u32, 0, 0, false, 0)
}

const fn d1(tenths: i64) -> Decimal {
    Decimal::from_parts(tenths as u32, 0, 0, false, 1)
}

impl Nutrient {
    pub const ALL: [Nutrient; 15] = [
        Nutrient::Fiber,
        Nutrient::Sugars,
        Nutrient::SaturatedFat,
        Nutrient::Salt,
        Nutrient::VitaminA,
        Nutrient::VitaminC,
        Nutrient::VitaminD,
        Nutrient::VitaminE,
        Nutrient::Folate,
        Nutrient::VitaminB12,
        Nutrient::Calcium,
        Nutrient::Iron,
        Nutrient::Magnesium,
        Nutrient::Potassium,
        Nutrient::Zinc,
    ];

    /// Wire and storage key; the suffix is the unit.
    pub fn key(self) -> &'static str {
        match self {
            Nutrient::Fiber => "fiberG",
            Nutrient::Sugars => "sugarsG",
            Nutrient::SaturatedFat => "saturatedFatG",
            Nutrient::Salt => "saltG",
            Nutrient::VitaminA => "vitaminAUg",
            Nutrient::VitaminC => "vitaminCMg",
            Nutrient::VitaminD => "vitaminDUg",
            Nutrient::VitaminE => "vitaminEMg",
            Nutrient::Folate => "folateUg",
            Nutrient::VitaminB12 => "vitaminB12Ug",
            Nutrient::Calcium => "calciumMg",
            Nutrient::Iron => "ironMg",
            Nutrient::Magnesium => "magnesiumMg",
            Nutrient::Potassium => "potassiumMg",
            Nutrient::Zinc => "zincMg",
        }
    }

    pub fn from_key(key: &str) -> Option<Nutrient> {
        Nutrient::ALL.into_iter().find(|n| n.key() == key)
    }

    /// Largest plausible amount per 100 g, in the nutrient's unit.
    fn max_per_100g(self) -> Decimal {
        match self {
            Nutrient::Fiber | Nutrient::Sugars | Nutrient::SaturatedFat | Nutrient::Salt => d(100),
            // Highest natural concentrations (liver, fortified foods) stay well below.
            _ => d(100_000),
        }
    }

    /// Indicative adult daily reference (ANSES 2021 / EFSA DRVs; WHO for salt).
    /// Without a profile, the higher of the sex-specific values is used.
    pub fn reference(self, sex: Option<Sex>) -> Reference {
        let by_sex = |female: Decimal, male: Decimal| match sex {
            Some(Sex::Female) => female,
            _ => male,
        };
        match self {
            Nutrient::Fiber => Reference::AtLeast(d(30)),
            Nutrient::Sugars => Reference::AtMost(d(100)),
            // Saturated fat is judged as a share of energy in the analysis; this is a fallback.
            Nutrient::SaturatedFat => Reference::AtMost(d(22)),
            Nutrient::Salt => Reference::AtMost(d(5)),
            Nutrient::VitaminA => Reference::AtLeast(by_sex(d(650), d(750))),
            Nutrient::VitaminC => Reference::AtLeast(d(110)),
            Nutrient::VitaminD => Reference::AtLeast(d(15)),
            Nutrient::VitaminE => Reference::AtLeast(by_sex(d1(99), d1(105))),
            Nutrient::Folate => Reference::AtLeast(d(330)),
            Nutrient::VitaminB12 => Reference::AtLeast(d(4)),
            Nutrient::Calcium => Reference::AtLeast(d(950)),
            Nutrient::Iron => Reference::AtLeast(by_sex(d(16), d(11))),
            Nutrient::Magnesium => Reference::AtLeast(by_sex(d(360), d(420))),
            Nutrient::Potassium => Reference::AtLeast(d(3500)),
            Nutrient::Zinc => Reference::AtLeast(by_sex(d(8), d(11))),
        }
    }
}

/// Known detailed nutrients per 100 g.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Details(BTreeMap<Nutrient, Decimal>);

impl Details {
    /// Parses `(key, decimal string)` pairs; empty strings mean unknown.
    pub fn parse<'a>(pairs: impl IntoIterator<Item = (&'a str, &'a str)>) -> Result<Self> {
        let mut map = BTreeMap::new();
        for (key, value) in pairs {
            let nutrient = Nutrient::from_key(key).ok_or(Invalid {
                field: "details",
                message: "Nutriment inconnu.",
            })?;
            if value.trim().is_empty() {
                continue;
            }
            map.insert(
                nutrient,
                parse_decimal(
                    value.trim(),
                    nutrient.key(),
                    "Valeur invalide, 3 décimales maximum.",
                )?,
            );
        }
        Self::new(map)
    }

    pub fn new(map: BTreeMap<Nutrient, Decimal>) -> Result<Self> {
        for (&n, &value) in &map {
            if value.is_sign_negative() || value > n.max_per_100g() || value.scale() > 3 {
                return Err(Invalid {
                    field: n.key(),
                    message: "Valeur hors limites pour 100 g.",
                });
            }
        }
        Ok(Self(map))
    }

    /// For imported catalog data: rounds to 3 decimals and drops out-of-range values.
    pub fn lenient(values: impl IntoIterator<Item = (Nutrient, Decimal)>) -> Self {
        Self(
            values
                .into_iter()
                .map(|(n, v)| (n, v.round_dp(3).normalize()))
                .filter(|&(n, v)| !v.is_sign_negative() && v <= n.max_per_100g())
                .collect(),
        )
    }

    pub(crate) fn without(mut self, nutrient: Nutrient) -> Self {
        self.0.remove(&nutrient);
        self
    }

    pub fn get(&self, nutrient: Nutrient) -> Option<Decimal> {
        self.0.get(&nutrient).copied()
    }

    pub fn iter(&self) -> impl Iterator<Item = (Nutrient, Decimal)> + '_ {
        self.0.iter().map(|(&n, &v)| (n, v))
    }
}

/// A nutrient summed over portions; `known` of `total` portions carried a value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NutrientTotal {
    pub nutrient: Nutrient,
    pub amount: Decimal,
    pub known: usize,
    pub total: usize,
}

pub fn nutrient_totals(portions: &[&Portion]) -> Vec<NutrientTotal> {
    Nutrient::ALL
        .into_iter()
        .map(|nutrient| {
            let values: Vec<Decimal> = portions
                .iter()
                .filter_map(|p| p.nutrient(nutrient))
                .collect();
            NutrientTotal {
                nutrient,
                amount: values.iter().sum(),
                known: values.len(),
                total: portions.len(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Grams, Nutrition};
    use std::str::FromStr;

    fn d(s: &str) -> Decimal {
        Decimal::from_str(s).unwrap()
    }

    #[test]
    fn lenient_drops_out_of_range_and_rounds() {
        let details = Details::lenient([
            (Nutrient::Fiber, d("2.34567")),
            (Nutrient::Salt, d("-1")),
            (Nutrient::Sugars, d("150")),
        ]);
        assert_eq!(details.get(Nutrient::Fiber), Some(d("2.346")));
        assert_eq!(details.get(Nutrient::Salt), None);
        assert_eq!(details.get(Nutrient::Sugars), None);
    }

    #[test]
    fn imported_nutrition_drops_inconsistent_details_but_rejects_bad_macros() {
        let details = Details::lenient([(Nutrient::Sugars, d("30")), (Nutrient::Iron, d("1.2"))]);
        let n = Nutrition::from_imported(d("100"), d("5"), d("20"), d("1"), details).unwrap();
        assert_eq!(n.details().get(Nutrient::Sugars), None);
        assert_eq!(n.details().get(Nutrient::Iron), Some(d("1.2")));
        assert!(
            Nutrition::from_imported(d("100"), d("60"), d("50"), d("1"), Details::default())
                .is_none()
        );
    }

    #[test]
    fn totals_count_known_values_only() {
        let with = Portion {
            grams: Grams::parse("200").unwrap(),
            nutrition: Nutrition::parse(
                "50",
                "1",
                "10",
                "0",
                Details::parse([("fiberG", "2.5")]).unwrap(),
            )
            .unwrap(),
        };
        let without = Portion {
            grams: Grams::parse("100").unwrap(),
            nutrition: Nutrition::parse("50", "1", "10", "0", Details::default()).unwrap(),
        };
        let fiber = nutrient_totals(&[&with, &without])
            .into_iter()
            .find(|t| t.nutrient == Nutrient::Fiber)
            .unwrap();
        assert_eq!((fiber.amount, fiber.known, fiber.total), (d("5"), 1, 2));
    }
}
