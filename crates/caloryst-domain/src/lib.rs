//! Nutrition rules: validated quantities, food snapshots and daily totals.
//!
//! Pure and synchronous: no storage, HTTP, clock or framework types.

mod nutrients;
mod profile;

pub use nutrients::{Details, Nutrient, NutrientTotal, Reference, nutrient_totals};
pub use profile::{
    Activity, Analysis, DayLog, Finding, NutrientAverage, Objective, Profile, ProfileInput,
    Recommendation, Sex, Status, Topic, analyze,
};

use rust_decimal::{Decimal, RoundingStrategy};
use std::str::FromStr;
use time::{Date, macros::format_description};

/// A rejected input: the field it concerns and a message safe to show users.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invalid {
    pub field: &'static str,
    pub message: &'static str,
}

pub type Result<T> = std::result::Result<T, Invalid>;

const fn invalid(field: &'static str, message: &'static str) -> Invalid {
    Invalid { field, message }
}

/// Parses a non-negative decimal string with at most 7 integer and 3 fractional digits.
pub fn parse_decimal(input: &str, field: &'static str, message: &'static str) -> Result<Decimal> {
    let (int, frac) = match input.split_once('.') {
        Some((int, frac)) if !frac.is_empty() => (int, frac),
        Some(_) => return Err(invalid(field, message)),
        None => (input, ""),
    };
    let digits = |s: &str| s.bytes().all(|b| b.is_ascii_digit());
    if !(1..=7).contains(&int.len()) || frac.len() > 3 || !digits(int) || !digits(frac) {
        return Err(invalid(field, message));
    }
    Decimal::from_str(input).map_err(|_| invalid(field, message))
}

fn in_range(
    value: Decimal,
    max: Decimal,
    field: &'static str,
    message: &'static str,
) -> Result<Decimal> {
    if value.is_sign_negative() || value > max || value.scale() > 3 {
        return Err(invalid(field, message));
    }
    Ok(value)
}

fn parse_range(
    input: &str,
    max: i64,
    field: &'static str,
    message: &'static str,
) -> Result<Decimal> {
    in_range(
        parse_decimal(input, field, message)?,
        Decimal::from(max),
        field,
        message,
    )
}

/// Rounds half away from zero to one decimal place, the documented display policy.
pub fn round1(value: Decimal) -> Decimal {
    value.round_dp_with_strategy(1, RoundingStrategy::MidpointAwayFromZero)
}

/// Parses an explicit `YYYY-MM-DD` calendar date chosen by the user.
pub fn parse_date(input: &str) -> Result<Date> {
    Date::parse(input, format_description!("[year]-[month]-[day]"))
        .map_err(|_| invalid("date", "Date invalide."))
}

pub fn format_date(date: Date) -> String {
    date.format(format_description!("[year]-[month]-[day]"))
        .unwrap_or_default()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Meal {
    Breakfast,
    Lunch,
    Dinner,
    Snack,
}

impl Meal {
    pub const ALL: [Meal; 4] = [Meal::Breakfast, Meal::Lunch, Meal::Dinner, Meal::Snack];

    pub fn as_str(self) -> &'static str {
        match self {
            Meal::Breakfast => "breakfast",
            Meal::Lunch => "lunch",
            Meal::Dinner => "dinner",
            Meal::Snack => "snack",
        }
    }

    pub fn parse(input: &str) -> Result<Meal> {
        Meal::ALL
            .into_iter()
            .find(|m| m.as_str() == input)
            .ok_or(invalid("meal", "Repas invalide."))
    }

    /// Share of the daily energy goal suggested for this meal, in percent.
    fn share(self) -> Decimal {
        Decimal::from(match self {
            Meal::Breakfast => 25,
            Meal::Lunch => 35,
            Meal::Dinner => 30,
            Meal::Snack => 10,
        })
    }
}

/// Validated food name: trimmed, 1 to 120 characters.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FoodName(String);

impl FoodName {
    pub fn new(input: &str) -> Result<Self> {
        let name = input.trim();
        if !(1..=120).contains(&name.chars().count()) {
            return Err(invalid("name", "Entre 1 et 120 caractères."));
        }
        Ok(Self(name.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Energy, macronutrients and known detailed nutrients per 100 g.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Nutrition {
    kcal: Decimal,
    protein: Decimal,
    carbs: Decimal,
    fat: Decimal,
    details: Details,
}

impl Nutrition {
    const KCAL_MESSAGE: &'static str = "Entre 0 et 900 kcal, 3 décimales maximum.";
    const MACRO_MESSAGE: &'static str = "Entre 0 et 100 g, 3 décimales maximum.";

    pub fn new(
        kcal: Decimal,
        protein: Decimal,
        carbs: Decimal,
        fat: Decimal,
        details: Details,
    ) -> Result<Self> {
        let hundred = Decimal::ONE_HUNDRED;
        let kcal = in_range(kcal, Decimal::from(900), "kcalPer100g", Self::KCAL_MESSAGE)?;
        let protein = in_range(protein, hundred, "proteinPer100g", Self::MACRO_MESSAGE)?;
        let carbs = in_range(carbs, hundred, "carbsPer100g", Self::MACRO_MESSAGE)?;
        let fat = in_range(fat, hundred, "fatPer100g", Self::MACRO_MESSAGE)?;
        if protein + carbs + fat > hundred {
            return Err(invalid(
                "fatPer100g",
                "Protéines + glucides + lipides ne peuvent dépasser 100 g.",
            ));
        }
        if details.get(Nutrient::Sugars).is_some_and(|s| s > carbs) {
            return Err(invalid(
                "sugarsG",
                "Les sucres ne peuvent dépasser les glucides.",
            ));
        }
        if details.get(Nutrient::SaturatedFat).is_some_and(|s| s > fat) {
            return Err(invalid(
                "saturatedFatG",
                "Les acides gras saturés ne peuvent dépasser les lipides.",
            ));
        }
        Ok(Self {
            kcal,
            protein,
            carbs,
            fat,
            details,
        })
    }

    pub fn parse(
        kcal: &str,
        protein: &str,
        carbs: &str,
        fat: &str,
        details: Details,
    ) -> Result<Self> {
        Self::new(
            parse_decimal(kcal, "kcalPer100g", Self::KCAL_MESSAGE)?,
            parse_decimal(protein, "proteinPer100g", Self::MACRO_MESSAGE)?,
            parse_decimal(carbs, "carbsPer100g", Self::MACRO_MESSAGE)?,
            parse_decimal(fat, "fatPer100g", Self::MACRO_MESSAGE)?,
            details,
        )
    }

    /// For imported catalog data: macros rounded to 3 decimals must be valid (otherwise
    /// `None`); detailed values that are out of range or inconsistent are dropped.
    pub fn from_imported(
        kcal: Decimal,
        protein: Decimal,
        carbs: Decimal,
        fat: Decimal,
        details: Details,
    ) -> Option<Self> {
        let [kcal, protein, carbs, fat] =
            [kcal, protein, carbs, fat].map(|v| v.round_dp(3).normalize());
        let mut details = details;
        if details.get(Nutrient::Sugars).is_some_and(|s| s > carbs) {
            details = details.without(Nutrient::Sugars);
        }
        if details.get(Nutrient::SaturatedFat).is_some_and(|s| s > fat) {
            details = details.without(Nutrient::SaturatedFat);
        }
        Self::new(kcal, protein, carbs, fat, details).ok()
    }

    pub fn details(&self) -> &Details {
        &self.details
    }

    pub fn kcal(&self) -> Decimal {
        self.kcal
    }

    pub fn protein(&self) -> Decimal {
        self.protein
    }

    pub fn carbs(&self) -> Decimal {
        self.carbs
    }

    pub fn fat(&self) -> Decimal {
        self.fat
    }
}

/// Portion weight in grams: greater than 0, at most 5000, 3 decimals.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Grams(Decimal);

impl Grams {
    const MESSAGE: &'static str = "Entre 0 et 5000 g, 3 décimales maximum.";

    pub fn new(value: Decimal) -> Result<Self> {
        let value = in_range(value, Decimal::from(5000), "grams", Self::MESSAGE)?;
        if value.is_zero() {
            return Err(invalid("grams", Self::MESSAGE));
        }
        Ok(Self(value))
    }

    pub fn parse(input: &str) -> Result<Self> {
        Self::new(parse_decimal(input, "grams", Self::MESSAGE)?)
    }

    pub fn value(self) -> Decimal {
        self.0
    }
}

/// A logged portion with the nutrition snapshot taken when it was recorded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Portion {
    pub grams: Grams,
    pub nutrition: Nutrition,
}

/// Unrounded amounts for one or more portions.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Amounts {
    pub kcal: Decimal,
    pub protein: Decimal,
    pub carbs: Decimal,
    pub fat: Decimal,
}

impl Portion {
    pub fn amounts(&self) -> Amounts {
        let factor = self.grams.value() / Decimal::ONE_HUNDRED;
        Amounts {
            kcal: self.nutrition.kcal * factor,
            protein: self.nutrition.protein * factor,
            carbs: self.nutrition.carbs * factor,
            fat: self.nutrition.fat * factor,
        }
    }

    /// Amount of a detailed nutrient in this portion, if the food records it.
    pub fn nutrient(&self, nutrient: Nutrient) -> Option<Decimal> {
        self.nutrition
            .details
            .get(nutrient)
            .map(|v| v * self.grams.value() / Decimal::ONE_HUNDRED)
    }
}

fn sum<'a>(portions: impl IntoIterator<Item = &'a Portion>) -> Amounts {
    portions
        .into_iter()
        .map(Portion::amounts)
        .fold(Amounts::default(), |a, b| Amounts {
            kcal: a.kcal + b.kcal,
            protein: a.protein + b.protein,
            carbs: a.carbs + b.carbs,
            fat: a.fat + b.fat,
        })
}

/// Daily targets.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Goals {
    pub kcal: Decimal,
    pub protein: Decimal,
    pub carbs: Decimal,
    pub fat: Decimal,
    pub water_ml: Decimal,
}

impl Default for Goals {
    fn default() -> Self {
        Self {
            kcal: Decimal::from(2000),
            protein: Decimal::from(120),
            carbs: Decimal::from(220),
            fat: Decimal::from(65),
            water_ml: Decimal::from(2000),
        }
    }
}

impl Goals {
    pub fn parse(
        kcal: &str,
        protein: &str,
        carbs: &str,
        fat: &str,
        water_ml: &str,
    ) -> Result<Self> {
        Ok(Self {
            kcal: parse_range(kcal, 10_000, "kcal", "Entre 0 et 10 000 kcal.")?,
            protein: parse_range(protein, 1000, "proteinG", "Entre 0 et 1000 g.")?,
            carbs: parse_range(carbs, 1000, "carbsG", "Entre 0 et 1000 g.")?,
            fat: parse_range(fat, 1000, "fatG", "Entre 0 et 1000 g.")?,
            water_ml: parse_range(water_ml, 10_000, "waterMl", "Entre 0 et 10 000 ml.")?,
        })
    }
}

/// Validated activity: name of 1 to 80 characters, 0 to 5000 kcal burned.
pub fn parse_activity(name: &str, kcal: &str) -> Result<(String, Decimal)> {
    let name = name.trim();
    if !(1..=80).contains(&name.chars().count()) {
        return Err(invalid("name", "Entre 1 et 80 caractères."));
    }
    Ok((
        name.to_owned(),
        parse_range(kcal, 5000, "kcal", "Entre 0 et 5000 kcal.")?,
    ))
}

pub const WATER_MAX_ML: i32 = 10_000;

/// A change in water intake, at most 2 litres at a time.
pub fn water_delta(delta_ml: i64) -> Result<i32> {
    i32::try_from(delta_ml)
        .ok()
        .filter(|d| d.abs() <= 2000)
        .ok_or(invalid("deltaMl", "Quantité invalide."))
}

/// One meal of the day: its items, energy and suggested target.
pub struct MealSummary<'a, T> {
    pub meal: Meal,
    pub kcal: Decimal,
    pub target_kcal: Decimal,
    pub entries: Vec<&'a T>,
}

pub struct DaySummary<'a, T> {
    pub totals: Amounts,
    pub burned_kcal: Decimal,
    pub remaining_kcal: Decimal,
    pub meals: Vec<MealSummary<'a, T>>,
}

/// Totals for one day from unrounded values; `entry` gives each item's meal and portion.
pub fn summarize<'a, T>(
    goals: &Goals,
    items: &'a [T],
    entry: impl Fn(&T) -> (Meal, &Portion),
    burned: impl IntoIterator<Item = Decimal>,
) -> DaySummary<'a, T> {
    let totals = sum(items.iter().map(|i| entry(i).1));
    let burned_kcal: Decimal = burned.into_iter().sum();
    let meals = Meal::ALL
        .into_iter()
        .map(|meal| {
            let entries: Vec<&T> = items.iter().filter(|i| entry(i).0 == meal).collect();
            MealSummary {
                meal,
                kcal: sum(entries.iter().map(|i| entry(i).1)).kcal,
                target_kcal: goals.kcal * meal.share() / Decimal::ONE_HUNDRED,
                entries,
            }
        })
        .collect();
    DaySummary {
        totals,
        burned_kcal,
        remaining_kcal: goals.kcal - totals.kcal + burned_kcal,
        meals,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> Decimal {
        Decimal::from_str(s).unwrap()
    }

    fn portion(grams: &str, kcal: &str) -> Portion {
        Portion {
            grams: Grams::parse(grams).unwrap(),
            nutrition: Nutrition::parse(kcal, "0", "0", "0", Details::default()).unwrap(),
        }
    }

    #[test]
    fn energy_and_rounding() {
        assert_eq!(portion("150", "80").amounts().kcal, d("120"));
        assert_eq!(round1(portion("180.5", "52.5").amounts().kcal), d("94.8"));
        assert_eq!(round1(d("0.05")), d("0.1"));
    }

    #[test]
    fn rejects_bad_input() {
        assert!(Grams::parse("0").is_err());
        assert!(Grams::parse("1.2345").is_err());
        assert!(Grams::parse("1.").is_err());
        assert!(Grams::parse("-1").is_err());
        assert!(Nutrition::parse("100", "60", "50", "0", Details::default()).is_err());
        let sugary = Details::parse([("sugarsG", "30")]).unwrap();
        assert!(Nutrition::parse("100", "0", "20", "0", sugary).is_err());
        assert!(Details::parse([("unknown", "1")]).is_err());
        assert!(parse_date("2026-02-30").is_err());
        assert!(water_delta(2001).is_err());
    }
}
