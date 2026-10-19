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

#[derive(Debug, Clone)]
pub struct Food {
    pub id: Uuid,
    pub name: FoodName,
    pub nutrition: Nutrition,
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
