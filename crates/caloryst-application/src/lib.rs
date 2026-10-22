//! Use cases and persistence ports. Every private operation is scoped to a verified actor.

use caloryst_domain::{
    self as domain, Analysis, DayLog, DaySummary, Details, FoodName, Goals, Grams, Invalid, Meal,
    Nutrition, Portion, Profile, ProfileInput, Recommendation, WATER_MAX_ML,
};
use rust_decimal::Decimal;
use std::future::Future;
use time::Date;
use time::Duration;
use uuid::Uuid;

/// A user whose identity the HTTP layer has verified from a session.
#[derive(Debug, Clone)]
pub struct Actor {
    user_id: String,
}

impl Actor {
    /// Only call with an identifier taken from a verified session, never from request data.
    pub fn verified(user_id: String) -> Self {
        Self { user_id }
    }

    pub fn user_id(&self) -> &str {
        &self.user_id
    }
}

#[derive(Debug)]
pub enum Error {
    Invalid(Invalid),
    /// Missing, or owned by someone else: callers must not distinguish the two.
    NotFound,
    /// An external service's rate limit is reached; retry later.
    Busy,
    Unavailable,
}

impl From<Invalid> for Error {
    fn from(value: Invalid) -> Self {
        Error::Invalid(value)
    }
}

impl From<StoreError> for Error {
    fn from(value: StoreError) -> Self {
        match value {
            StoreError::NotFound => Error::NotFound,
            StoreError::Unavailable => Error::Unavailable,
        }
    }
}

/// Persistence failures, without driver types.
#[derive(Debug)]
pub enum StoreError {
    NotFound,
    Unavailable,
}

pub type StoreResult<T> = Result<T, StoreError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FoodSource {
    /// Created by the user; private to them.
    User,
    /// ANSES CIQUAL table (Etalab 2.0); shared and read-only.
    Ciqual,
    /// Open Food Facts product (ODbL); shared and read-only.
    OpenFoodFacts,
}

impl FoodSource {
    pub fn as_str(self) -> &'static str {
        match self {
            FoodSource::User => "user",
            FoodSource::Ciqual => "ciqual",
            FoodSource::OpenFoodFacts => "openfoodfacts",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Food {
    pub id: Uuid,
    pub name: FoodName,
    pub nutrition: Nutrition,
    pub source: FoodSource,
    pub brand: Option<String>,
}

/// A catalog food from an external source, identified by its source id (CIQUAL code, barcode).
#[derive(Debug, Clone)]
pub struct ImportedFood {
    pub source: FoodSource,
    pub source_id: String,
    pub name: FoodName,
    pub brand: Option<String>,
    pub nutrition: Nutrition,
}

/// Lowercase, accent-free words used to match food names ("Pâtes, cuites" -> "pates cuites").
pub fn search_key(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.to_lowercase().chars() {
        match c {
            'à' | 'â' | 'ä' | 'á' | 'ã' => out.push('a'),
            'é' | 'è' | 'ê' | 'ë' => out.push('e'),
            'î' | 'ï' | 'í' | 'ì' => out.push('i'),
            'ô' | 'ö' | 'ó' | 'ò' | 'õ' => out.push('o'),
            'ù' | 'û' | 'ü' | 'ú' => out.push('u'),
            'ç' => out.push('c'),
            'ñ' => out.push('n'),
            'ÿ' => out.push('y'),
            'œ' => out.push_str("oe"),
            'æ' => out.push_str("ae"),
            c if c.is_alphanumeric() => out.push(c),
            _ => out.push(' '),
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Up to five search words of at least two characters.
pub fn search_terms(query: &str) -> Vec<String> {
    search_key(query)
        .split(' ')
        .filter(|w| w.chars().count() >= 2)
        .take(5)
        .map(str::to_owned)
        .collect()
}

#[derive(Debug, Clone)]
pub struct Entry {
    pub id: Uuid,
    pub meal: Meal,
    pub food_name: String,
    pub portion: Portion,
}

#[derive(Debug, Clone)]
pub struct Activity {
    pub id: Uuid,
    pub name: String,
    pub kcal: Decimal,
}

pub trait FoodStore: Send + Sync {
    fn list_foods(&self, owner: &str) -> impl Future<Output = StoreResult<Vec<Food>>> + Send;
    fn insert_food(&self, owner: &str, food: &Food)
    -> impl Future<Output = StoreResult<()>> + Send;
    /// Loads a food visible to `owner`; others' foods are `NotFound`.
    fn food(&self, owner: &str, id: Uuid) -> impl Future<Output = StoreResult<Food>> + Send;
}

pub trait DiaryStore: Send + Sync {
    fn entries(
        &self,
        owner: &str,
        date: Date,
    ) -> impl Future<Output = StoreResult<Vec<Entry>>> + Send;
    fn insert_entry(
        &self,
        owner: &str,
        date: Date,
        entry: &Entry,
    ) -> impl Future<Output = StoreResult<()>> + Send;
    fn update_entry_grams(
        &self,
        owner: &str,
        id: Uuid,
        grams: Grams,
    ) -> impl Future<Output = StoreResult<()>> + Send;
    fn delete_entry(&self, owner: &str, id: Uuid) -> impl Future<Output = StoreResult<()>> + Send;
    fn water_ml(&self, owner: &str, date: Date) -> impl Future<Output = StoreResult<i32>> + Send;
    /// Atomically adds `delta` and clamps the day's total to `0..=max`; returns the new total.
    fn change_water(
        &self,
        owner: &str,
        date: Date,
        delta: i32,
        max: i32,
    ) -> impl Future<Output = StoreResult<i32>> + Send;
    fn activities(
        &self,
        owner: &str,
        date: Date,
    ) -> impl Future<Output = StoreResult<Vec<Activity>>> + Send;
    fn insert_activity(
        &self,
        owner: &str,
        date: Date,
        activity: &Activity,
    ) -> impl Future<Output = StoreResult<()>> + Send;
    fn delete_activity(
        &self,
        owner: &str,
        id: Uuid,
    ) -> impl Future<Output = StoreResult<()>> + Send;
    /// Entries of every day in `from..=to`, with their date.
    fn entries_between(
        &self,
        owner: &str,
        from: Date,
        to: Date,
    ) -> impl Future<Output = StoreResult<Vec<(Date, Entry)>>> + Send;
    fn activities_between(
        &self,
        owner: &str,
        from: Date,
        to: Date,
    ) -> impl Future<Output = StoreResult<Vec<(Date, Activity)>>> + Send;
}

pub trait CatalogStore: Send + Sync {
    /// Catalog foods whose name contains every term.
    fn search_catalog(
        &self,
        terms: &[String],
        limit: i64,
    ) -> impl Future<Output = StoreResult<Vec<Food>>> + Send;
    /// Inserts or refreshes catalog foods; returns them stored, in the same order.
    fn upsert_catalog(
        &self,
        foods: &[ImportedFood],
    ) -> impl Future<Output = StoreResult<Vec<Food>>> + Send;
    fn catalog_food(
        &self,
        source: FoodSource,
        source_id: &str,
    ) -> impl Future<Output = StoreResult<Option<Food>>> + Send;
}

#[derive(Debug)]
pub enum LookupError {
    NotFound,
    RateLimited,
    Unavailable,
}

impl From<LookupError> for Error {
    fn from(value: LookupError) -> Self {
        match value {
            LookupError::NotFound => Error::NotFound,
            LookupError::RateLimited => Error::Busy,
            LookupError::Unavailable => Error::Unavailable,
        }
    }
}

/// An external product database (Open Food Facts).
pub trait ProductLookup: Send + Sync {
    fn search(
        &self,
        query: &str,
    ) -> impl Future<Output = Result<Vec<ImportedFood>, LookupError>> + Send;
    fn barcode(&self, code: &str)
    -> impl Future<Output = Result<ImportedFood, LookupError>> + Send;
}

pub trait ProfileStore: Send + Sync {
    fn profile(&self, owner: &str) -> impl Future<Output = StoreResult<Option<Profile>>> + Send;
    fn save_profile(
        &self,
        owner: &str,
        profile: &Profile,
    ) -> impl Future<Output = StoreResult<()>> + Send;
}

pub trait GoalsStore: Send + Sync {
    fn goals(&self, owner: &str) -> impl Future<Output = StoreResult<Option<Goals>>> + Send;
    fn save_goals(
        &self,
        owner: &str,
        goals: &Goals,
    ) -> impl Future<Output = StoreResult<()>> + Send;
}

pub struct NewFood<'a> {
    pub name: &'a str,
    pub kcal: &'a str,
    pub protein: &'a str,
    pub carbs: &'a str,
    pub fat: &'a str,
    /// Detailed nutrients as (key, decimal string); empty values are unknown.
    pub details: Vec<(&'a str, &'a str)>,
}

pub async fn list_foods(store: &impl FoodStore, actor: &Actor) -> Result<Vec<Food>, Error> {
    Ok(store.list_foods(actor.user_id()).await?)
}

pub async fn create_food(
    store: &impl FoodStore,
    actor: &Actor,
    input: NewFood<'_>,
) -> Result<Food, Error> {
    let food = Food {
        id: Uuid::new_v4(),
        source: FoodSource::User,
        brand: None,
        name: FoodName::new(input.name)?,
        nutrition: Nutrition::parse(
            input.kcal,
            input.protein,
            input.carbs,
            input.fat,
            Details::parse(input.details)?,
        )?,
    };
    store.insert_food(actor.user_id(), &food).await?;
    Ok(food)
}

pub async fn goals(store: &impl GoalsStore, actor: &Actor) -> Result<Goals, Error> {
    Ok(store.goals(actor.user_id()).await?.unwrap_or_default())
}

pub async fn set_goals(
    store: &impl GoalsStore,
    actor: &Actor,
    goals: [&str; 5],
) -> Result<Goals, Error> {
    let [kcal, protein, carbs, fat, water] = goals;
    let goals = Goals::parse(kcal, protein, carbs, fat, water)?;
    store.save_goals(actor.user_id(), &goals).await?;
    Ok(goals)
}

pub struct Day {
    pub date: Date,
    pub goals: Goals,
    pub entries: Vec<Entry>,
    pub activities: Vec<Activity>,
    pub water_ml: i32,
}

impl Day {
    pub fn summary(&self) -> DaySummary<'_, Entry> {
        domain::summarize(
            &self.goals,
            &self.entries,
            |e| (e.meal, &e.portion),
            self.activities.iter().map(|a| a.kcal),
        )
    }
}

pub async fn day<S: DiaryStore + GoalsStore>(
    store: &S,
    actor: &Actor,
    date: &str,
) -> Result<Day, Error> {
    let date = domain::parse_date(date)?;
    let owner = actor.user_id();
    Ok(Day {
        date,
        goals: store.goals(owner).await?.unwrap_or_default(),
        entries: store.entries(owner, date).await?,
        activities: store.activities(owner, date).await?,
        water_ml: store.water_ml(owner, date).await?,
    })
}

pub struct RecordFood<'a> {
    pub food_id: &'a str,
    pub grams: &'a str,
    pub date: &'a str,
    pub meal: &'a str,
}

pub async fn record_food<S: FoodStore + DiaryStore>(
    store: &S,
    actor: &Actor,
    input: RecordFood<'_>,
) -> Result<Entry, Error> {
    let grams = Grams::parse(input.grams)?;
    let date = domain::parse_date(input.date)?;
    let meal = Meal::parse(input.meal)?;
    let food_id = Uuid::parse_str(input.food_id).map_err(|_| Error::NotFound)?;
    let food = store.food(actor.user_id(), food_id).await?;
    let entry = Entry {
        id: Uuid::new_v4(),
        meal,
        food_name: food.name.as_str().to_owned(),
        portion: Portion {
            grams,
            nutrition: food.nutrition,
        },
    };
    store.insert_entry(actor.user_id(), date, &entry).await?;
    Ok(entry)
}

fn entry_id(id: &str) -> Result<Uuid, Error> {
    Uuid::parse_str(id).map_err(|_| Error::NotFound)
}

pub async fn update_entry(
    store: &impl DiaryStore,
    actor: &Actor,
    id: &str,
    grams: &str,
) -> Result<(), Error> {
    let grams = Grams::parse(grams)?;
    Ok(store
        .update_entry_grams(actor.user_id(), entry_id(id)?, grams)
        .await?)
}

pub async fn delete_entry(store: &impl DiaryStore, actor: &Actor, id: &str) -> Result<(), Error> {
    Ok(store.delete_entry(actor.user_id(), entry_id(id)?).await?)
}

pub async fn change_water(
    store: &impl DiaryStore,
    actor: &Actor,
    date: &str,
    delta_ml: i64,
) -> Result<i32, Error> {
    let delta = domain::water_delta(delta_ml)?;
    let date = domain::parse_date(date)?;
    Ok(store
        .change_water(actor.user_id(), date, delta, WATER_MAX_ML)
        .await?)
}

pub async fn add_activity(
    store: &impl DiaryStore,
    actor: &Actor,
    date: &str,
    name: &str,
    kcal: &str,
) -> Result<Activity, Error> {
    let (name, kcal) = domain::parse_activity(name, kcal)?;
    let date = domain::parse_date(date)?;
    let activity = Activity {
        id: Uuid::new_v4(),
        name,
        kcal,
    };
    store
        .insert_activity(actor.user_id(), date, &activity)
        .await?;
    Ok(activity)
}

pub async fn delete_activity(
    store: &impl DiaryStore,
    actor: &Actor,
    id: &str,
) -> Result<(), Error> {
    Ok(store
        .delete_activity(actor.user_id(), entry_id(id)?)
        .await?)
}

/// The stored profile and, when present, the needs it implies on `today`.
pub async fn profile(
    store: &impl ProfileStore,
    actor: &Actor,
    today: Date,
) -> Result<Option<(Profile, Recommendation)>, Error> {
    Ok(store.profile(actor.user_id()).await?.map(|p| {
        let r = p.recommend(today);
        (p, r)
    }))
}

pub async fn set_profile(
    store: &impl ProfileStore,
    actor: &Actor,
    input: ProfileInput<'_>,
    today: Date,
) -> Result<(Profile, Recommendation), Error> {
    let profile = Profile::parse(input, today)?;
    store.save_profile(actor.user_id(), &profile).await?;
    let recommendation = profile.recommend(today);
    Ok((profile, recommendation))
}

/// Energy eaten on one day of a week.
pub struct WeekDay {
    pub date: Date,
    pub kcal: Decimal,
}

/// Monday to Sunday of the week containing `date`, with the energy eaten each day.
pub async fn week<S: DiaryStore + GoalsStore>(
    store: &S,
    actor: &Actor,
    date: &str,
) -> Result<(Goals, Vec<WeekDay>), Error> {
    let date = domain::parse_date(date)?;
    let monday = date - Duration::days(i64::from(date.weekday().number_days_from_monday()));
    let sunday = monday + Duration::days(6);
    let owner = actor.user_id();
    let goals = store.goals(owner).await?.unwrap_or_default();
    let entries = store.entries_between(owner, monday, sunday).await?;
    let days = (0..7)
        .map(|i| {
            let day = monday + Duration::days(i);
            WeekDay {
                date: day,
                kcal: entries
                    .iter()
                    .filter(|(d, _)| *d == day)
                    .map(|(_, e)| e.portion.amounts().kcal)
                    .sum(),
            }
        })
        .collect();
    Ok((goals, days))
}

pub const ANALYSIS_DAYS: i64 = 7;

pub struct AnalysisView {
    pub from: Date,
    pub to: Date,
    pub goals: Goals,
    pub profile: Option<(Profile, Recommendation)>,
    /// Entries of the last day, for its detailed nutrients.
    pub day_entries: Vec<Entry>,
    pub analysis: Analysis,
}

/// Judges the 7 days ending on `date` against the user's goals and profile.
pub async fn analysis<S: DiaryStore + GoalsStore + ProfileStore>(
    store: &S,
    actor: &Actor,
    date: &str,
) -> Result<AnalysisView, Error> {
    let to = domain::parse_date(date)?;
    let from = to - Duration::days(ANALYSIS_DAYS - 1);
    let owner = actor.user_id();
    let goals = store.goals(owner).await?.unwrap_or_default();
    let profile = store.profile(owner).await?.map(|p| {
        let r = p.recommend(to);
        (p, r)
    });
    let entries = store.entries_between(owner, from, to).await?;
    let activities = store.activities_between(owner, from, to).await?;
    let days: Vec<DayLog<'_>> = (0..ANALYSIS_DAYS)
        .map(|i| {
            let day = from + Duration::days(i);
            DayLog {
                portions: entries
                    .iter()
                    .filter(|(d, _)| *d == day)
                    .map(|(_, e)| &e.portion)
                    .collect(),
                burned_kcal: activities
                    .iter()
                    .filter(|(d, _)| *d == day)
                    .map(|(_, a)| a.kcal)
                    .sum(),
            }
        })
        .collect();
    let analysis = domain::analyze(
        &goals,
        profile.as_ref().map(|(p, _)| p),
        ANALYSIS_DAYS as usize,
        &days,
    );
    let day_entries = entries
        .iter()
        .filter(|(d, _)| *d == to)
        .map(|(_, e)| e.clone())
        .collect();
    Ok(AnalysisView {
        from,
        to,
        goals,
        profile,
        day_entries,
        analysis,
    })
}

/// The user's foods matching the query, then catalog foods (CIQUAL, cached Open Food Facts).
pub async fn search_foods<S: FoodStore + CatalogStore>(
    store: &S,
    actor: &Actor,
    query: &str,
) -> Result<Vec<Food>, Error> {
    let terms = search_terms(query);
    let own = store.list_foods(actor.user_id()).await?;
    if terms.is_empty() {
        return Ok(own);
    }
    let mut foods: Vec<Food> = own
        .into_iter()
        .filter(|f| {
            let key = search_key(f.name.as_str());
            terms.iter().all(|t| key.contains(t.as_str()))
        })
        .collect();
    foods.extend(store.search_catalog(&terms, 40).await?);
    Ok(foods)
}

/// Searches Open Food Facts and caches the results in the shared catalog.
pub async fn search_open_food_facts(
    store: &impl CatalogStore,
    lookup: &impl ProductLookup,
    query: &str,
) -> Result<Vec<Food>, Error> {
    let query = query.trim();
    if !(2..=100).contains(&query.chars().count()) {
        return Err(Error::Invalid(Invalid {
            field: "q",
            message: "Entre 2 et 100 caractères.",
        }));
    }
    let found = lookup.search(query).await?;
    Ok(store.upsert_catalog(&found).await?)
}

/// A product by barcode: from the catalog cache, otherwise from Open Food Facts.
pub async fn food_by_barcode(
    store: &impl CatalogStore,
    lookup: &impl ProductLookup,
    code: &str,
) -> Result<Food, Error> {
    if !(6..=14).contains(&code.len()) || !code.bytes().all(|b| b.is_ascii_digit()) {
        return Err(Error::Invalid(Invalid {
            field: "barcode",
            message: "Code-barres invalide.",
        }));
    }
    if let Some(food) = store.catalog_food(FoodSource::OpenFoodFacts, code).await? {
        return Ok(food);
    }
    let product = lookup.barcode(code).await?;
    store
        .upsert_catalog(std::slice::from_ref(&product))
        .await?
        .pop()
        .ok_or(Error::Unavailable)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_key_folds_accents_and_punctuation() {
        assert_eq!(
            search_key("Pâtes sèches, cuites (Œufs)"),
            "pates seches cuites oeufs"
        );
        assert_eq!(search_key("  Crème   brûlée "), "creme brulee");
    }

    #[test]
    fn search_terms_drop_short_words_and_cap_at_five() {
        assert_eq!(search_terms("a riz cuit"), vec!["riz", "cuit"]);
        assert_eq!(search_terms("un deux trois quatre cinq six").len(), 5);
        assert!(search_terms("%_").is_empty());
    }
}
