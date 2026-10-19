//! Use cases and persistence ports. Every private operation is scoped to a verified actor.

use caloryst_domain::{
    self as domain, DaySummary, FoodName, Goals, Grams, Invalid, Meal, Nutrition, Portion,
    WATER_MAX_ML,
};
use rust_decimal::Decimal;
use std::future::Future;
use time::Date;
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
        nutrition: Nutrition::parse(input.kcal, input.protein, input.carbs, input.fat)?,
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
