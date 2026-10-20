//! Open Food Facts client (ODbL data). Respects their per-IP limits with a local budget:
//! 15 product and 10 search requests per minute per IP, so we stay below both.

use caloryst_application::{FoodSource, ImportedFood, LookupError, ProductLookup};
use caloryst_domain::{Details, FoodName, Nutrient, Nutrition};
use rust_decimal::Decimal;
use serde_json::Value;
use std::{
    collections::VecDeque,
    str::FromStr,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

const SEARCH_PER_MINUTE: usize = 8;
const PRODUCT_PER_MINUTE: usize = 12;

#[derive(Clone)]
pub struct OpenFoodFacts {
    http: reqwest::Client,
    search_budget: Arc<Mutex<VecDeque<Instant>>>,
    product_budget: Arc<Mutex<VecDeque<Instant>>>,
}

/// Takes one request from a sliding one-minute budget, or refuses.
async fn take(budget: &Mutex<VecDeque<Instant>>, per_minute: usize) -> Result<(), LookupError> {
    let mut sent = budget.lock().await;
    let now = Instant::now();
    while sent
        .front()
        .is_some_and(|t| now.duration_since(*t) > Duration::from_secs(60))
    {
        sent.pop_front();
    }
    if sent.len() >= per_minute {
        return Err(LookupError::RateLimited);
    }
    sent.push_back(now);
    Ok(())
}

fn decimal(value: &Value) -> Option<Decimal> {
    let text = match value {
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.trim().replace(',', "."),
        _ => return None,
    };
    Decimal::from_str(&text)
        .or_else(|_| Decimal::from_scientific(&text))
        .ok()
}

/// OFF stores nutrients per 100 g in grams; Kalo keys carry their own unit.
const DETAILS: [(Nutrient, &str, i64); 15] = [
    (Nutrient::Fiber, "fiber_100g", 1),
    (Nutrient::Sugars, "sugars_100g", 1),
    (Nutrient::SaturatedFat, "saturated-fat_100g", 1),
    (Nutrient::Salt, "salt_100g", 1),
    (Nutrient::VitaminA, "vitamin-a_100g", 1_000_000),
    (Nutrient::VitaminC, "vitamin-c_100g", 1000),
    (Nutrient::VitaminD, "vitamin-d_100g", 1_000_000),
    (Nutrient::VitaminE, "vitamin-e_100g", 1000),
    (Nutrient::Folate, "vitamin-b9_100g", 1_000_000),
    (Nutrient::VitaminB12, "vitamin-b12_100g", 1_000_000),
    (Nutrient::Calcium, "calcium_100g", 1000),
    (Nutrient::Iron, "iron_100g", 1000),
    (Nutrient::Magnesium, "magnesium_100g", 1000),
    (Nutrient::Potassium, "potassium_100g", 1000),
    (Nutrient::Zinc, "zinc_100g", 1000),
];

fn clip(text: &str) -> String {
    text.trim().chars().take(120).collect()
}

/// Maps an OFF product; products without usable name, energy and macros are skipped.
fn product(p: &Value) -> Option<ImportedFood> {
    let code = p.get("code")?.as_str()?.trim();
    if !(6..=14).contains(&code.len()) || !code.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let text = |key: &str| {
        p.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
    };
    let name = FoodName::new(&clip(
        text("product_name_fr").or_else(|| text("product_name"))?,
    ))
    .ok()?;
    let brand = match p.get("brands") {
        Some(Value::String(s)) => s.split(',').next().map(clip),
        Some(Value::Array(a)) => a.first().and_then(Value::as_str).map(clip),
        _ => None,
    }
    .filter(|b| !b.is_empty());
    let n = p.get("nutriments")?;
    let get = |key: &str| n.get(key).and_then(decimal);
    let kcal = get("energy-kcal_100g").or_else(|| {
        get("energy_100g").map(|kj| kj / Decimal::from_str("4.184").unwrap_or(Decimal::ONE))
    })?;
    let details = Details::lenient(DETAILS.iter().filter_map(|&(nutrient, key, factor)| {
        Some((nutrient, get(key)? * Decimal::from(factor)))
    }));
    let nutrition = Nutrition::from_imported(
        kcal,
        get("proteins_100g")?,
        get("carbohydrates_100g")?,
        get("fat_100g")?,
        details,
    )?;
    Some(ImportedFood {
        source: FoodSource::OpenFoodFacts,
        source_id: code.to_owned(),
        name,
        brand,
        nutrition,
    })
}

impl OpenFoodFacts {
    pub fn new(user_agent: &str) -> Result<Self, String> {
        let http = reqwest::Client::builder()
            .user_agent(user_agent)
            .timeout(Duration::from_secs(8))
            .build()
            .map_err(|e| format!("cannot build HTTP client: {e}"))?;
        Ok(Self {
            http,
            search_budget: Arc::default(),
            product_budget: Arc::default(),
        })
    }

    async fn get(&self, url: &str, query: &[(&str, &str)]) -> Result<Value, LookupError> {
        let response = self.http.get(url).query(query).send().await.map_err(|e| {
            tracing::warn!(error = %e, "Open Food Facts request failed");
            LookupError::Unavailable
        })?;
        match response.status().as_u16() {
            404 => Err(LookupError::NotFound),
            429 => Err(LookupError::RateLimited),
            s if !(200..300).contains(&s) => {
                tracing::warn!(status = s, "Open Food Facts error");
                Err(LookupError::Unavailable)
            }
            _ => response.json().await.map_err(|_| LookupError::Unavailable),
        }
    }
}

const FIELDS: &str = "code,product_name,product_name_fr,brands,nutriments";

impl ProductLookup for OpenFoodFacts {
    async fn search(&self, query: &str) -> Result<Vec<ImportedFood>, LookupError> {
        take(&self.search_budget, SEARCH_PER_MINUTE).await?;
        let body = self
            .get(
                "https://search.openfoodfacts.org/search",
                &[
                    ("q", query),
                    ("langs", "fr"),
                    ("page_size", "24"),
                    ("fields", FIELDS),
                ],
            )
            .await?;
        Ok(body
            .get("hits")
            .and_then(Value::as_array)
            .map(|hits| hits.iter().filter_map(product).collect())
            .unwrap_or_default())
    }

    async fn barcode(&self, code: &str) -> Result<ImportedFood, LookupError> {
        take(&self.product_budget, PRODUCT_PER_MINUTE).await?;
        let url = format!("https://world.openfoodfacts.org/api/v2/product/{code}");
        let body = self.get(&url, &[("fields", FIELDS)]).await?;
        body.get("product")
            .and_then(product)
            .ok_or(LookupError::NotFound)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_product_units() {
        let p: Value = serde_json::json!({
            "code": "3017620422003", "product_name_fr": "Pâte à tartiner", "brands": "Marque, Autre",
            "nutriments": { "energy-kcal_100g": 539, "proteins_100g": 6.3, "carbohydrates_100g": 57.5,
                "fat_100g": 30.9, "sugars_100g": 56.3, "vitamin-c_100g": 0.0012, "calcium_100g": "0.11" }
        });
        let f = product(&p).unwrap();
        assert_eq!(f.brand.as_deref(), Some("Marque"));
        assert_eq!(
            f.nutrition.details().get(Nutrient::VitaminC),
            Some(Decimal::from_str("1.2").unwrap())
        );
        assert_eq!(
            f.nutrition.details().get(Nutrient::Calcium),
            Some(Decimal::from(110))
        );
    }
}
