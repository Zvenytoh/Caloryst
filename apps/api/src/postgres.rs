//! PostgreSQL adapter for the application ports. Every query is scoped to its owner.

use caloryst_application::{
    Activity, DiaryStore, Entry, Food, FoodStore, GoalsStore, ProfileStore, StoreError, StoreResult,
};
use caloryst_domain::{
    Activity as ActivityLevel, Details, FoodName, Goals, Grams, Meal, Nutrition, Objective,
    Portion, Profile, Sex,
};
use rust_decimal::Decimal;
use sqlx::PgPool;
use std::collections::BTreeMap;
use time::Date;
use uuid::Uuid;

#[derive(Clone)]
pub struct PgStore {
    pool: PgPool,
}

impl PgStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn unavailable(err: sqlx::Error) -> StoreError {
    tracing::error!(error = %err, "database query failed");
    StoreError::Unavailable
}

/// A stored row that no longer satisfies domain rules is a server fault, not a user error.
fn corrupt<T>(what: &str) -> impl FnOnce(T) -> StoreError + '_ {
    move |_| {
        tracing::error!(row = what, "stored row violates domain rules");
        StoreError::Unavailable
    }
}

fn affected(result: sqlx::postgres::PgQueryResult) -> StoreResult<()> {
    if result.rows_affected() == 0 {
        Err(StoreError::NotFound)
    } else {
        Ok(())
    }
}

/// Details are stored as a JSON object of decimal strings.
fn details_json(details: &Details) -> String {
    let map: BTreeMap<&str, String> = details
        .iter()
        .map(|(n, v)| (n.key(), v.normalize().to_string()))
        .collect();
    serde_json::to_string(&map).unwrap_or_else(|_| "{}".into())
}

fn details_from(json: &str) -> StoreResult<Details> {
    let map: BTreeMap<String, String> = serde_json::from_str(json).map_err(corrupt("details"))?;
    Details::parse(map.iter().map(|(k, v)| (k.as_str(), v.as_str()))).map_err(corrupt("details"))
}

type NutritionRow = (Decimal, Decimal, Decimal, Decimal, String);

fn nutrition((kcal, protein, carbs, fat, details): NutritionRow) -> StoreResult<Nutrition> {
    Nutrition::new(kcal, protein, carbs, fat, details_from(&details)?).map_err(corrupt("nutrition"))
}

type FoodRow = (Uuid, String, Decimal, Decimal, Decimal, Decimal, String);

fn food((id, name, kcal, protein, carbs, fat, details): FoodRow) -> StoreResult<Food> {
    Ok(Food {
        id,
        name: FoodName::new(&name).map_err(corrupt("food"))?,
        nutrition: nutrition((kcal, protein, carbs, fat, details))?,
    })
}

impl FoodStore for PgStore {
    async fn list_foods(&self, owner: &str) -> StoreResult<Vec<Food>> {
        let rows: Vec<FoodRow> = sqlx::query_as(
            "SELECT id, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, details::text
             FROM foods WHERE owner_id = $1 ORDER BY lower(name) LIMIT 1000",
        )
        .bind(owner)
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)?;
        rows.into_iter().map(food).collect()
    }

    async fn insert_food(&self, owner: &str, f: &Food) -> StoreResult<()> {
        let n = &f.nutrition;
        sqlx::query(
            "INSERT INTO foods (id, owner_id, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)",
        )
        .bind(f.id)
        .bind(owner)
        .bind(f.name.as_str())
        .bind(n.kcal())
        .bind(n.protein())
        .bind(n.carbs())
        .bind(n.fat())
        .bind(details_json(n.details()))
        .execute(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(())
    }

    async fn food(&self, owner: &str, id: Uuid) -> StoreResult<Food> {
        let row: Option<FoodRow> = sqlx::query_as(
            "SELECT id, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, details::text
             FROM foods WHERE owner_id = $1 AND id = $2",
        )
        .bind(owner)
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?;
        food(row.ok_or(StoreError::NotFound)?)
    }
}

type EntryRow = (
    Date,
    Uuid,
    String,
    String,
    Decimal,
    Decimal,
    Decimal,
    Decimal,
    Decimal,
    String,
);

fn entry(
    (date, id, meal, food_name, grams, kcal, protein, carbs, fat, details): EntryRow,
) -> StoreResult<(Date, Entry)> {
    Ok((
        date,
        Entry {
            id,
            meal: Meal::parse(&meal).map_err(corrupt("entry"))?,
            food_name,
            portion: Portion {
                grams: Grams::new(grams).map_err(corrupt("entry"))?,
                nutrition: nutrition((kcal, protein, carbs, fat, details))?,
            },
        },
    ))
}

impl PgStore {
    async fn entry_rows(
        &self,
        owner: &str,
        from: Date,
        to: Date,
    ) -> StoreResult<Vec<(Date, Entry)>> {
        let rows: Vec<EntryRow> = sqlx::query_as(
            "SELECT diary_date, id, meal, food_name, grams, kcal_per_100g, protein_per_100g, carbs_per_100g,
                    fat_per_100g, details::text
             FROM diary_entries WHERE owner_id = $1 AND diary_date BETWEEN $2 AND $3
             ORDER BY diary_date, created_at, id LIMIT 5000",
        )
        .bind(owner)
        .bind(from)
        .bind(to)
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)?;
        rows.into_iter().map(entry).collect()
    }

    async fn activity_rows(
        &self,
        owner: &str,
        from: Date,
        to: Date,
    ) -> StoreResult<Vec<(Date, Activity)>> {
        let rows: Vec<(Date, Uuid, String, Decimal)> = sqlx::query_as(
            "SELECT diary_date, id, name, kcal FROM activities
             WHERE owner_id = $1 AND diary_date BETWEEN $2 AND $3 ORDER BY diary_date, created_at, id LIMIT 2000",
        )
        .bind(owner)
        .bind(from)
        .bind(to)
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(rows
            .into_iter()
            .map(|(date, id, name, kcal)| (date, Activity { id, name, kcal }))
            .collect())
    }
}

impl DiaryStore for PgStore {
    async fn entries(&self, owner: &str, date: Date) -> StoreResult<Vec<Entry>> {
        Ok(self
            .entry_rows(owner, date, date)
            .await?
            .into_iter()
            .map(|(_, e)| e)
            .collect())
    }

    async fn insert_entry(&self, owner: &str, date: Date, e: &Entry) -> StoreResult<()> {
        let n = &e.portion.nutrition;
        sqlx::query(
            "INSERT INTO diary_entries
               (id, owner_id, diary_date, meal, food_name, grams, kcal_per_100g, protein_per_100g, carbs_per_100g,
                fat_per_100g, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)",
        )
        .bind(e.id)
        .bind(owner)
        .bind(date)
        .bind(e.meal.as_str())
        .bind(&e.food_name)
        .bind(e.portion.grams.value())
        .bind(n.kcal())
        .bind(n.protein())
        .bind(n.carbs())
        .bind(n.fat())
        .bind(details_json(n.details()))
        .execute(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(())
    }

    async fn update_entry_grams(&self, owner: &str, id: Uuid, grams: Grams) -> StoreResult<()> {
        let result = sqlx::query(
            "UPDATE diary_entries SET grams = $3, updated_at = now() WHERE owner_id = $1 AND id = $2",
        )
        .bind(owner)
        .bind(id)
        .bind(grams.value())
        .execute(&self.pool)
        .await
        .map_err(unavailable)?;
        affected(result)
    }

    async fn delete_entry(&self, owner: &str, id: Uuid) -> StoreResult<()> {
        let result = sqlx::query("DELETE FROM diary_entries WHERE owner_id = $1 AND id = $2")
            .bind(owner)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(unavailable)?;
        affected(result)
    }

    async fn water_ml(&self, owner: &str, date: Date) -> StoreResult<i32> {
        let row: Option<(i32,)> =
            sqlx::query_as("SELECT ml FROM water_intake WHERE owner_id = $1 AND diary_date = $2")
                .bind(owner)
                .bind(date)
                .fetch_optional(&self.pool)
                .await
                .map_err(unavailable)?;
        Ok(row.map_or(0, |(ml,)| ml))
    }

    async fn change_water(
        &self,
        owner: &str,
        date: Date,
        delta: i32,
        max: i32,
    ) -> StoreResult<i32> {
        let (ml,): (i32,) = sqlx::query_as(
            "INSERT INTO water_intake (owner_id, diary_date, ml) VALUES ($1, $2, LEAST(GREATEST($3, 0), $4))
             ON CONFLICT (owner_id, diary_date)
             DO UPDATE SET ml = LEAST(GREATEST(water_intake.ml + $3, 0), $4)
             RETURNING ml",
        )
        .bind(owner)
        .bind(date)
        .bind(delta)
        .bind(max)
        .fetch_one(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(ml)
    }

    async fn activities(&self, owner: &str, date: Date) -> StoreResult<Vec<Activity>> {
        Ok(self
            .activity_rows(owner, date, date)
            .await?
            .into_iter()
            .map(|(_, a)| a)
            .collect())
    }

    async fn insert_activity(&self, owner: &str, date: Date, a: &Activity) -> StoreResult<()> {
        sqlx::query(
            "INSERT INTO activities (id, owner_id, diary_date, name, kcal) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(a.id)
        .bind(owner)
        .bind(date)
        .bind(&a.name)
        .bind(a.kcal)
        .execute(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(())
    }

    async fn delete_activity(&self, owner: &str, id: Uuid) -> StoreResult<()> {
        let result = sqlx::query("DELETE FROM activities WHERE owner_id = $1 AND id = $2")
            .bind(owner)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(unavailable)?;
        affected(result)
    }

    async fn entries_between(
        &self,
        owner: &str,
        from: Date,
        to: Date,
    ) -> StoreResult<Vec<(Date, Entry)>> {
        self.entry_rows(owner, from, to).await
    }

    async fn activities_between(
        &self,
        owner: &str,
        from: Date,
        to: Date,
    ) -> StoreResult<Vec<(Date, Activity)>> {
        self.activity_rows(owner, from, to).await
    }
}

impl GoalsStore for PgStore {
    async fn goals(&self, owner: &str) -> StoreResult<Option<Goals>> {
        let row: Option<(Decimal, Decimal, Decimal, Decimal, Decimal)> = sqlx::query_as(
            "SELECT kcal, protein_g, carbs_g, fat_g, water_ml FROM goals WHERE owner_id = $1",
        )
        .bind(owner)
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(row.map(|(kcal, protein, carbs, fat, water_ml)| Goals {
            kcal,
            protein,
            carbs,
            fat,
            water_ml,
        }))
    }

    async fn save_goals(&self, owner: &str, g: &Goals) -> StoreResult<()> {
        sqlx::query(
            "INSERT INTO goals (owner_id, kcal, protein_g, carbs_g, fat_g, water_ml) VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (owner_id) DO UPDATE SET kcal = $2, protein_g = $3, carbs_g = $4, fat_g = $5, water_ml = $6, updated_at = now()",
        )
        .bind(owner)
        .bind(g.kcal)
        .bind(g.protein)
        .bind(g.carbs)
        .bind(g.fat)
        .bind(g.water_ml)
        .execute(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(())
    }
}

impl ProfileStore for PgStore {
    async fn profile(&self, owner: &str) -> StoreResult<Option<Profile>> {
        let row: Option<(String, i32, Decimal, Decimal, String, String)> = sqlx::query_as(
            "SELECT sex, birth_year, height_cm, weight_kg, activity, objective FROM profiles WHERE owner_id = $1",
        )
        .bind(owner)
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?;
        row.map(
            |(sex, birth_year, height_cm, weight_kg, activity, objective)| {
                Ok(Profile {
                    sex: Sex::parse(&sex).map_err(corrupt("profile"))?,
                    birth_year,
                    height_cm,
                    weight_kg,
                    activity: ActivityLevel::parse(&activity).map_err(corrupt("profile"))?,
                    objective: Objective::parse(&objective).map_err(corrupt("profile"))?,
                })
            },
        )
        .transpose()
    }

    async fn save_profile(&self, owner: &str, p: &Profile) -> StoreResult<()> {
        sqlx::query(
            "INSERT INTO profiles (owner_id, sex, birth_year, height_cm, weight_kg, activity, objective)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (owner_id) DO UPDATE SET sex = $2, birth_year = $3, height_cm = $4, weight_kg = $5,
               activity = $6, objective = $7, updated_at = now()",
        )
        .bind(owner)
        .bind(p.sex.as_str())
        .bind(p.birth_year)
        .bind(p.height_cm)
        .bind(p.weight_kg)
        .bind(p.activity.as_str())
        .bind(p.objective.as_str())
        .execute(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(())
    }
}
