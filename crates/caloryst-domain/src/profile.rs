//! Body profile, energy needs and goal-based analysis.
//!
//! Formulas and thresholds are general adult guidance, not medical advice:
//! Mifflin-St Jeor resting energy, standard activity factors, protein per kg of
//! body weight, and ANSES/WHO limits for fibre, sugars, saturated fat and salt.

use crate::nutrients::{Nutrient, NutrientTotal, Reference, nutrient_totals};
use crate::{Goals, Invalid, Portion, Result, parse_decimal};
use rust_decimal::{Decimal, RoundingStrategy};
use time::Date;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sex {
    Female,
    Male,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Activity {
    Sedentary,
    Light,
    Moderate,
    Active,
    VeryActive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Objective {
    LoseFat,
    Maintain,
    GainMuscle,
}

macro_rules! keyed_enum {
    ($ty:ty, $field:literal, $message:literal, [$($variant:path => $key:literal),+ $(,)?]) => {
        impl $ty {
            pub fn as_str(self) -> &'static str {
                match self { $($variant => $key),+ }
            }

            pub fn parse(input: &str) -> Result<Self> {
                match input {
                    $($key => Ok($variant),)+
                    _ => Err(Invalid { field: $field, message: $message }),
                }
            }
        }
    };
}

keyed_enum!(Sex, "sex", "Choisissez un sexe.", [Sex::Female => "female", Sex::Male => "male"]);
keyed_enum!(Activity, "activity", "Niveau d’activité invalide.", [
    Activity::Sedentary => "sedentary",
    Activity::Light => "light",
    Activity::Moderate => "moderate",
    Activity::Active => "active",
    Activity::VeryActive => "very_active",
]);
keyed_enum!(Objective, "objective", "Objectif invalide.", [
    Objective::LoseFat => "lose_fat",
    Objective::Maintain => "maintain",
    Objective::GainMuscle => "gain_muscle",
]);

fn dec(value: &str) -> Decimal {
    value.parse().unwrap_or_default()
}

impl Activity {
    /// Multiplier of resting energy for total daily energy expenditure.
    fn factor(self) -> Decimal {
        dec(match self {
            Activity::Sedentary => "1.2",
            Activity::Light => "1.375",
            Activity::Moderate => "1.55",
            Activity::Active => "1.725",
            Activity::VeryActive => "1.9",
        })
    }
}

impl Objective {
    /// Energy relative to maintenance.
    fn energy_factor(self) -> Decimal {
        dec(match self {
            Objective::LoseFat => "0.8",
            Objective::Maintain => "1",
            Objective::GainMuscle => "1.1",
        })
    }

    /// Protein target in grams per kilogram of body weight.
    fn protein_per_kg(self) -> Decimal {
        dec(match self {
            Objective::LoseFat => "2.0",
            Objective::Maintain => "1.6",
            Objective::GainMuscle => "1.8",
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Profile {
    pub sex: Sex,
    pub birth_year: i32,
    pub height_cm: Decimal,
    pub weight_kg: Decimal,
    pub activity: Activity,
    pub objective: Objective,
}

pub struct ProfileInput<'a> {
    pub sex: &'a str,
    pub birth_year: i32,
    pub height_cm: &'a str,
    pub weight_kg: &'a str,
    pub activity: &'a str,
    pub objective: &'a str,
}

impl Profile {
    /// Validates a profile; `today` bounds the age to adults (16 to 100 years).
    pub fn parse(input: ProfileInput<'_>, today: Date) -> Result<Self> {
        let age = today.year() - input.birth_year;
        if !(16..=100).contains(&age) {
            return Err(Invalid {
                field: "birthYear",
                message: "Kalo s’adresse aux adultes de 16 à 100 ans.",
            });
        }
        let height_cm = parse_decimal(input.height_cm, "heightCm", "Entre 120 et 230 cm.")?;
        if height_cm < Decimal::from(120) || height_cm > Decimal::from(230) || height_cm.scale() > 1
        {
            return Err(Invalid {
                field: "heightCm",
                message: "Entre 120 et 230 cm, 1 décimale maximum.",
            });
        }
        let weight_kg = parse_decimal(input.weight_kg, "weightKg", "Entre 30 et 300 kg.")?;
        if weight_kg < Decimal::from(30) || weight_kg > Decimal::from(300) || weight_kg.scale() > 1
        {
            return Err(Invalid {
                field: "weightKg",
                message: "Entre 30 et 300 kg, 1 décimale maximum.",
            });
        }
        Ok(Self {
            sex: Sex::parse(input.sex)?,
            birth_year: input.birth_year,
            height_cm,
            weight_kg,
            activity: Activity::parse(input.activity)?,
            objective: Objective::parse(input.objective)?,
        })
    }

    pub fn age_on(&self, date: Date) -> i32 {
        date.year() - self.birth_year
    }

    /// Mifflin-St Jeor resting energy in kcal per day.
    pub fn resting_energy(&self, on: Date) -> Decimal {
        let base = Decimal::from(10) * self.weight_kg + dec("6.25") * self.height_cm
            - Decimal::from(5 * self.age_on(on));
        base + Decimal::from(if self.sex == Sex::Male { 5 } else { -161 })
    }

    pub fn recommend(&self, on: Date) -> Recommendation {
        let resting = self.resting_energy(on);
        let maintenance = resting * self.activity.factor();
        let round = |v: Decimal, step: i64| {
            (v / Decimal::from(step))
                .round_dp_with_strategy(0, RoundingStrategy::MidpointAwayFromZero)
                * Decimal::from(step)
        };
        let kcal = round(maintenance * self.objective.energy_factor(), 10);
        let protein = round(self.weight_kg * self.objective.protein_per_kg(), 1);
        // 30 % of energy from fat (9 kcal/g), the rest from carbohydrates (4 kcal/g).
        let fat = round(kcal * dec("0.30") / Decimal::from(9), 1);
        let carbs = round(
            ((kcal - protein * Decimal::from(4) - fat * Decimal::from(9)) / Decimal::from(4))
                .max(Decimal::ZERO),
            1,
        );
        // About 35 ml of water per kg of body weight.
        let water_ml = round(self.weight_kg * Decimal::from(35), 50);
        Recommendation {
            resting_kcal: round(resting, 1),
            maintenance_kcal: round(maintenance, 10),
            goals: Goals {
                kcal,
                protein,
                carbs,
                fat,
                water_ml,
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Recommendation {
    pub resting_kcal: Decimal,
    pub maintenance_kcal: Decimal,
    pub goals: Goals,
}

/// One logged day for the analysis.
pub struct DayLog<'a> {
    pub portions: Vec<&'a Portion>,
    pub burned_kcal: Decimal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Topic {
    Logging,
    Energy,
    Protein,
    Fat,
    Carbs,
    Fiber,
    Sugars,
    SaturatedFat,
    Salt,
}

impl Topic {
    pub fn as_str(self) -> &'static str {
        match self {
            Topic::Logging => "logging",
            Topic::Energy => "energy",
            Topic::Protein => "protein",
            Topic::Fat => "fat",
            Topic::Carbs => "carbs",
            Topic::Fiber => "fiber",
            Topic::Sugars => "sugars",
            Topic::SaturatedFat => "saturatedFat",
            Topic::Salt => "salt",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Good,
    Low,
    High,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Good => "good",
            Status::Low => "low",
            Status::High => "high",
        }
    }
}

/// A judged quantity: `value` against the acceptable range `[min, max]`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Finding {
    pub topic: Topic,
    pub status: Status,
    pub value: Decimal,
    pub min: Option<Decimal>,
    pub max: Option<Decimal>,
}

fn judge(topic: Topic, value: Decimal, min: Option<Decimal>, max: Option<Decimal>) -> Finding {
    let status = match (min, max) {
        (Some(min), _) if value < min => Status::Low,
        (_, Some(max)) if value > max => Status::High,
        _ => Status::Good,
    };
    Finding {
        topic,
        status,
        value,
        min,
        max,
    }
}

/// Average daily nutrient over logged days, against its reference.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NutrientAverage {
    pub nutrient: Nutrient,
    pub average: Decimal,
    pub known: usize,
    pub total: usize,
    pub reference: Reference,
}

pub struct Analysis {
    pub period_days: usize,
    pub days_logged: usize,
    pub avg_kcal: Decimal,
    pub avg_burned_kcal: Decimal,
    pub avg_protein: Decimal,
    pub avg_carbs: Decimal,
    pub avg_fat: Decimal,
    pub protein_per_kg: Option<Decimal>,
    /// Share of energy from protein, carbohydrates and fat, in percent.
    pub energy_split: Option<(Decimal, Decimal, Decimal)>,
    pub findings: Vec<Finding>,
    pub nutrients: Vec<NutrientAverage>,
}

/// Judges a period of days (days without any portion count as not logged).
pub fn analyze(
    goals: &Goals,
    profile: Option<&Profile>,
    period_days: usize,
    days: &[DayLog<'_>],
) -> Analysis {
    let logged: Vec<&DayLog<'_>> = days.iter().filter(|d| !d.portions.is_empty()).collect();
    let n = Decimal::from(logged.len().max(1));
    let all: Vec<&Portion> = logged
        .iter()
        .flat_map(|d| d.portions.iter().copied())
        .collect();
    let totals = all
        .iter()
        .map(|p| p.amounts())
        .fold(crate::Amounts::default(), |a, b| crate::Amounts {
            kcal: a.kcal + b.kcal,
            protein: a.protein + b.protein,
            carbs: a.carbs + b.carbs,
            fat: a.fat + b.fat,
        });
    let avg = |v: Decimal| v / n;
    let (avg_kcal, avg_protein, avg_carbs, avg_fat) = (
        avg(totals.kcal),
        avg(totals.protein),
        avg(totals.carbs),
        avg(totals.fat),
    );
    let avg_burned_kcal = avg(logged.iter().map(|d| d.burned_kcal).sum());
    let pct = Decimal::ONE_HUNDRED;
    let macro_energy =
        avg_protein * Decimal::from(4) + avg_carbs * Decimal::from(4) + avg_fat * Decimal::from(9);
    let energy_split = (!macro_energy.is_zero()).then(|| {
        (
            avg_protein * Decimal::from(4) * pct / macro_energy,
            avg_carbs * Decimal::from(4) * pct / macro_energy,
            avg_fat * Decimal::from(9) * pct / macro_energy,
        )
    });
    let nutrient_sums = nutrient_totals(&all);
    let sex = profile.map(|p| p.sex);
    let nutrients: Vec<NutrientAverage> = nutrient_sums
        .iter()
        .map(
            |&NutrientTotal {
                 nutrient,
                 amount,
                 known,
                 total,
             }| NutrientAverage {
                nutrient,
                average: avg(amount),
                known,
                total,
                reference: nutrient.reference(sex),
            },
        )
        .collect();

    let mut findings = vec![judge(
        Topic::Logging,
        Decimal::from(logged.len()),
        Some(Decimal::from(4.min(period_days))),
        None,
    )];
    if !logged.is_empty() {
        let tolerance = dec("0.1");
        let net = avg_kcal - avg_burned_kcal;
        findings.push(judge(
            Topic::Energy,
            net,
            Some(goals.kcal * (Decimal::ONE - tolerance)),
            Some(goals.kcal * (Decimal::ONE + tolerance)),
        ));
        findings.push(judge(
            Topic::Protein,
            avg_protein,
            Some(goals.protein * dec("0.9")),
            None,
        ));
        if let Some((_, carbs_pct, fat_pct)) = energy_split {
            findings.push(judge(
                Topic::Fat,
                fat_pct,
                Some(Decimal::from(20)),
                Some(Decimal::from(40)),
            ));
            findings.push(judge(
                Topic::Carbs,
                carbs_pct,
                Some(Decimal::from(35)),
                Some(Decimal::from(60)),
            ));
        }
        // Detailed limits only when at least half the portions carry the value.
        let enough = |n: Nutrient| {
            nutrients
                .iter()
                .find(|a| a.nutrient == n)
                .filter(|a| a.known * 2 >= a.total.max(1))
        };
        if let Some(a) = enough(Nutrient::Fiber) {
            findings.push(judge(
                Topic::Fiber,
                a.average,
                Some(Decimal::from(25)),
                None,
            ));
        }
        if let Some(a) = enough(Nutrient::Sugars) {
            findings.push(judge(
                Topic::Sugars,
                a.average,
                None,
                Some(Decimal::from(100)),
            ));
        }
        if let (Some(a), false) = (enough(Nutrient::SaturatedFat), avg_kcal.is_zero()) {
            let share = a.average * Decimal::from(9) * pct / avg_kcal;
            findings.push(judge(
                Topic::SaturatedFat,
                share,
                None,
                Some(Decimal::from(12)),
            ));
        }
        if let Some(a) = enough(Nutrient::Salt) {
            findings.push(judge(Topic::Salt, a.average, None, Some(Decimal::from(5))));
        }
    }

    Analysis {
        period_days,
        days_logged: logged.len(),
        avg_kcal,
        avg_burned_kcal,
        avg_protein,
        avg_carbs,
        avg_fat,
        protein_per_kg: profile.map(|p| avg_protein / p.weight_kg),
        energy_split,
        findings,
        nutrients,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::date;

    #[test]
    fn mifflin_st_jeor() {
        let input = ProfileInput {
            sex: "male",
            birth_year: 1996,
            height_cm: "180",
            weight_kg: "80",
            activity: "moderate",
            objective: "maintain",
        };
        let p = Profile::parse(input, date!(2026 - 10 - 20)).unwrap();
        // 10*80 + 6.25*180 - 5*30 + 5 = 1780; x1.55 = 2759 -> 2760.
        assert_eq!(p.resting_energy(date!(2026 - 10 - 20)), Decimal::from(1780));
        let r = p.recommend(date!(2026 - 10 - 20));
        assert_eq!(r.goals.kcal, Decimal::from(2760));
        assert_eq!(r.goals.protein, Decimal::from(128));
    }
}
