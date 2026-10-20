//! Bundled CIQUAL table (ANSES, Etalab 2.0), loaded into the shared catalog once per version.
//! Regenerate `data/ciqual-2025.tsv` with `data/convert_ciqual.py`.

use crate::postgres::PgStore;
use caloryst_application::{CatalogStore, FoodSource, ImportedFood};
use caloryst_domain::{Details, FoodName, Nutrient, Nutrition};
use rust_decimal::Decimal;
use std::str::FromStr;

const VERSION: &str = "ciqual-2025-11-03";
const TSV: &str = include_str!("../data/ciqual-2025.tsv");

fn parse(tsv: &str) -> Result<Vec<ImportedFood>, String> {
    let mut lines = tsv.lines();
    let header: Vec<&str> = lines
        .next()
        .ok_or("empty CIQUAL file")?
        .split('\t')
        .collect();
    let nutrients: Vec<Option<Nutrient>> = header.iter().map(|h| Nutrient::from_key(h)).collect();
    let dec = |s: &str| (!s.is_empty()).then(|| Decimal::from_str(s).ok()).flatten();
    let mut foods = Vec::new();
    for (i, line) in lines.enumerate() {
        let cols: Vec<&str> = line.split('\t').collect();
        if cols.len() != header.len() {
            return Err(format!(
                "CIQUAL line {}: {} columns, expected {}",
                i + 2,
                cols.len(),
                header.len()
            ));
        }
        let (Some(kcal), Some(protein), Some(carbs), Some(fat)) =
            (dec(cols[2]), dec(cols[3]), dec(cols[4]), dec(cols[5]))
        else {
            continue;
        };
        let details = Details::lenient(
            cols.iter()
                .zip(&nutrients)
                .filter_map(|(c, n)| Some(((*n)?, dec(c)?))),
        );
        let (Ok(name), Some(nutrition)) = (
            FoodName::new(cols[1]),
            Nutrition::from_imported(kcal, protein, carbs, fat, details),
        ) else {
            continue;
        };
        foods.push(ImportedFood {
            source: FoodSource::Ciqual,
            source_id: cols[0].to_owned(),
            name,
            brand: None,
            nutrition,
        });
    }
    Ok(foods)
}

/// Loads the bundled CIQUAL version if it is not in the database yet.
pub async fn import_ciqual(store: &PgStore) -> Result<(), String> {
    let db = |e: sqlx::Error| format!("CIQUAL import failed: {e}");
    if store.imported(VERSION).await.map_err(db)? {
        return Ok(());
    }
    let foods = parse(TSV)?;
    store
        .upsert_catalog(&foods)
        .await
        .map_err(|_| "CIQUAL import failed: database error".to_owned())?;
    store
        .mark_imported(VERSION, foods.len())
        .await
        .map_err(db)?;
    tracing::info!(
        foods = foods.len(),
        version = VERSION,
        "CIQUAL catalog imported"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn bundled_file_parses() {
        let foods = super::parse(super::TSV).unwrap();
        assert!(foods.len() > 3000);
    }
}
