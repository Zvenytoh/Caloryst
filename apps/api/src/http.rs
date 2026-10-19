//! HTTP adapter: routes, DTOs, session extraction, CSRF check and error mapping.

use crate::{
    identity::{DEV_COOKIE, Identity, Session},
    postgres::PgStore,
};
use axum::{
    Json, Router,
    extract::{FromRequestParts, Path, Query, Request, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderValue, Method, StatusCode, header, request::Parts},
    middleware::{self, Next},
    response::{IntoResponse, Redirect, Response},
    routing::{get, patch, post},
};
use caloryst_application::{self as app, Actor, Entry, Error};
use caloryst_domain::{
    Amounts, Details, Goals, Invalid, NutrientTotal, Profile, ProfileInput, Recommendation,
    Reference, format_date, nutrient_totals, round1,
};
use rust_decimal::{Decimal, RoundingStrategy};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;
use time::{Date, OffsetDateTime};
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub store: PgStore,
    pub identity: Identity,
    pub public_origin: String,
}

// ---------- errors ----------

pub enum ApiError {
    Malformed,
    Unauthenticated,
    Forbidden,
    Invalid(Invalid),
    NotFound,
    Unavailable,
}

impl From<Error> for ApiError {
    fn from(err: Error) -> Self {
        match err {
            Error::Invalid(i) => ApiError::Invalid(i),
            Error::NotFound => ApiError::NotFound,
            Error::Unavailable => ApiError::Unavailable,
        }
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(err: sqlx::Error) -> Self {
        tracing::error!(error = %err, "session lookup failed");
        ApiError::Unavailable
    }
}

impl From<JsonRejection> for ApiError {
    fn from(_: JsonRejection) -> Self {
        ApiError::Malformed
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            ApiError::Malformed => (StatusCode::BAD_REQUEST, "malformed", "Requête invalide."),
            ApiError::Unauthenticated => (
                StatusCode::UNAUTHORIZED,
                "unauthenticated",
                "Connectez-vous pour continuer.",
            ),
            ApiError::Forbidden => (StatusCode::FORBIDDEN, "forbidden", "Requête refusée."),
            ApiError::Invalid(_) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "validation",
                "Vérifiez les champs.",
            ),
            ApiError::NotFound => (StatusCode::NOT_FOUND, "not_found", "Ressource introuvable."),
            ApiError::Unavailable => (
                StatusCode::SERVICE_UNAVAILABLE,
                "unavailable",
                "Service momentanément indisponible.",
            ),
        };
        let request_id = Uuid::new_v4();
        if status.is_server_error() {
            tracing::warn!(%request_id, code, "request failed");
        }
        let mut body = json!({ "code": code, "message": message, "requestId": request_id });
        if let ApiError::Invalid(i) = self {
            body["fieldErrors"] = json!({ i.field: i.message });
        }
        (status, Json(body)).into_response()
    }
}

type ApiResult<T = Json<Value>> = Result<T, ApiError>;

// ---------- session ----------

fn cookie_header(headers: &HeaderMap) -> &str {
    headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
}

/// A request from a signed-in user, verified against the session store.
pub struct Authed {
    actor: Actor,
}

impl FromRequestParts<AppState> for Authed {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let session = state
            .identity
            .resolve(cookie_header(&parts.headers))
            .await?
            .ok_or(ApiError::Unauthenticated)?;
        Ok(Authed {
            actor: Actor::verified(session.user_id),
        })
    }
}

/// Rejects state-changing requests that do not come from the app's own origin.
async fn same_origin(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let safe = matches!(
        *request.method(),
        Method::GET | Method::HEAD | Method::OPTIONS
    );
    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok());
    if !safe && origin != Some(state.public_origin.as_str()) {
        return ApiError::Forbidden.into_response();
    }
    next.run(request).await
}

// ---------- DTOs ----------

/// Stored values as plain decimal strings ("90", "52.5").
fn dec(value: Decimal) -> String {
    value.normalize().to_string()
}

/// Computed values rounded half away from zero to one decimal ("94.8").
fn dec1(value: Decimal) -> String {
    let rounded = round1(value);
    if rounded.is_zero() {
        "0.0".into()
    } else {
        format!("{rounded:.1}")
    }
}

/// Detailed nutrient amounts keep two decimals: micrograms matter ("0.36").
fn dec2(value: Decimal) -> String {
    let rounded = value.round_dp_with_strategy(2, RoundingStrategy::MidpointAwayFromZero);
    if rounded.is_zero() {
        "0".into()
    } else {
        rounded.normalize().to_string()
    }
}

fn details_json(details: &Details) -> Value {
    Value::Object(
        details
            .iter()
            .map(|(n, v)| (n.key().to_owned(), Value::String(dec(v))))
            .collect::<Map<_, _>>(),
    )
}

fn reference_json(reference: Reference) -> Value {
    match reference {
        Reference::AtLeast(v) => json!({ "kind": "atLeast", "amount": dec(v) }),
        Reference::AtMost(v) => json!({ "kind": "atMost", "amount": dec(v) }),
    }
}

fn nutrient_totals_json(totals: &[NutrientTotal]) -> Value {
    totals
        .iter()
        .map(|t| json!({ "key": t.nutrient.key(), "amount": dec2(t.amount), "known": t.known, "total": t.total }))
        .collect()
}

fn food_json(food: &app::Food) -> Value {
    let n = &food.nutrition;
    json!({
        "id": food.id,
        "name": food.name.as_str(),
        "kcalPer100g": dec(n.kcal()),
        "proteinPer100g": dec(n.protein()),
        "carbsPer100g": dec(n.carbs()),
        "fatPer100g": dec(n.fat()),
        "details": details_json(n.details()),
    })
}

fn goals_json(g: &Goals) -> Value {
    json!({
        "kcal": dec(g.kcal),
        "proteinG": dec(g.protein),
        "carbsG": dec(g.carbs),
        "fatG": dec(g.fat),
        "waterMl": dec(g.water_ml),
    })
}

fn entry_json(e: &Entry) -> Value {
    let Amounts {
        kcal,
        protein,
        carbs,
        fat,
    } = e.portion.amounts();
    json!({
        "id": e.id,
        "meal": e.meal.as_str(),
        "foodName": e.food_name,
        "grams": dec(e.portion.grams.value()),
        "kcalPer100g": dec(e.portion.nutrition.kcal()),
        "kcal": dec1(kcal),
        "proteinG": dec1(protein),
        "carbsG": dec1(carbs),
        "fatG": dec1(fat),
    })
}

fn activity_json(a: &app::Activity) -> Value {
    json!({ "id": a.id, "name": a.name, "kcal": dec(a.kcal) })
}

// ---------- handlers ----------

async fn session(State(state): State<AppState>, headers: HeaderMap) -> ApiResult {
    Ok(Json(
        match state.identity.resolve(cookie_header(&headers)).await? {
            Some(Session { display_name, .. }) => {
                json!({ "authenticated": true, "user": { "displayName": display_name } })
            }
            None => json!({ "authenticated": false }),
        },
    ))
}

fn clear_cookie(name: &str, secure: bool) -> HeaderValue {
    let secure = if secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!(
        "{name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}"
    ))
    .unwrap_or(HeaderValue::from_static(""))
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Response> {
    if let Some(session) = state.identity.resolve(cookie_header(&headers)).await? {
        state.identity.revoke(&session.token).await?;
    }
    let secure = state.public_origin.starts_with("https://");
    let names = [
        "__Secure-better-auth.session_token",
        "better-auth.session_token",
        DEV_COOKIE,
    ];
    let mut response = StatusCode::NO_CONTENT.into_response();
    for name in names
        .into_iter()
        .filter(|n| secure || !n.starts_with("__Secure-"))
    {
        response
            .headers_mut()
            .append(header::SET_COOKIE, clear_cookie(name, secure));
    }
    Ok(response)
}

/// Dev mode only: signs in the shared local user and returns to the app.
async fn dev_login(State(state): State<AppState>) -> ApiResult<Response> {
    if !state.identity.is_dev() {
        return Err(ApiError::NotFound);
    }
    let token = state.identity.dev_sign_in().await?;
    let secure = if state.public_origin.starts_with("https://") {
        "; Secure"
    } else {
        ""
    };
    let cookie =
        format!("{DEV_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000{secure}");
    let mut response = Redirect::to("/").into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(|_| ApiError::Unavailable)?,
    );
    Ok(response)
}

async fn list_foods(State(s): State<AppState>, a: Authed) -> ApiResult {
    let foods = app::list_foods(&s.store, &a.actor).await?;
    Ok(Json(
        json!({ "foods": foods.iter().map(food_json).collect::<Vec<_>>() }),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewFoodBody {
    name: String,
    kcal_per_100g: String,
    protein_per_100g: String,
    carbs_per_100g: String,
    fat_per_100g: String,
    #[serde(default)]
    details: BTreeMap<String, String>,
}

async fn create_food(
    State(s): State<AppState>,
    a: Authed,
    body: Result<Json<NewFoodBody>, JsonRejection>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let Json(b) = body?;
    let input = app::NewFood {
        name: &b.name,
        kcal: &b.kcal_per_100g,
        protein: &b.protein_per_100g,
        carbs: &b.carbs_per_100g,
        fat: &b.fat_per_100g,
        details: b
            .details
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect(),
    };
    let food = app::create_food(&s.store, &a.actor, input).await?;
    Ok((StatusCode::CREATED, Json(food_json(&food))))
}

async fn get_goals(State(s): State<AppState>, a: Authed) -> ApiResult {
    Ok(Json(goals_json(&app::goals(&s.store, &a.actor).await?)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoalsBody {
    kcal: String,
    protein_g: String,
    carbs_g: String,
    fat_g: String,
    water_ml: String,
}

async fn put_goals(
    State(s): State<AppState>,
    a: Authed,
    body: Result<Json<GoalsBody>, JsonRejection>,
) -> ApiResult {
    let Json(b) = body?;
    let goals = app::set_goals(
        &s.store,
        &a.actor,
        [&b.kcal, &b.protein_g, &b.carbs_g, &b.fat_g, &b.water_ml],
    )
    .await?;
    Ok(Json(goals_json(&goals)))
}

#[derive(Deserialize)]
struct DateQuery {
    date: String,
}

async fn diary(State(s): State<AppState>, a: Authed, Query(q): Query<DateQuery>) -> ApiResult {
    let day = app::day(&s.store, &a.actor, &q.date).await?;
    let summary = day.summary();
    Ok(Json(json!({
        "date": format_date(day.date),
        "goals": goals_json(&day.goals),
        "totals": {
            "kcal": dec1(summary.totals.kcal),
            "proteinG": dec1(summary.totals.protein),
            "carbsG": dec1(summary.totals.carbs),
            "fatG": dec1(summary.totals.fat),
        },
        "burnedKcal": dec1(summary.burned_kcal),
        "remainingKcal": dec1(summary.remaining_kcal),
        "waterMl": day.water_ml.to_string(),
        "meals": summary.meals.iter().map(|m| json!({
            "meal": m.meal.as_str(),
            "kcal": dec1(m.kcal),
            "targetKcal": dec1(m.target_kcal),
            "entries": m.entries.iter().map(|e| entry_json(e)).collect::<Vec<_>>(),
        })).collect::<Vec<_>>(),
        "activities": day.activities.iter().map(activity_json).collect::<Vec<_>>(),
        "nutrients": nutrient_totals_json(&nutrient_totals(&day.entries.iter().map(|e| &e.portion).collect::<Vec<_>>())),
    })))
}

/// Server date used for ages and recommendations.
fn today() -> Date {
    OffsetDateTime::now_utc().date()
}

fn profile_json(profile: Option<&(Profile, Recommendation)>) -> Value {
    match profile {
        None => json!({ "profile": null, "recommendation": null }),
        Some((p, r)) => json!({
            "profile": {
                "sex": p.sex.as_str(),
                "birthYear": p.birth_year,
                "heightCm": dec(p.height_cm),
                "weightKg": dec(p.weight_kg),
                "activity": p.activity.as_str(),
                "objective": p.objective.as_str(),
            },
            "recommendation": {
                "restingKcal": dec(r.resting_kcal),
                "maintenanceKcal": dec(r.maintenance_kcal),
                "goals": goals_json(&r.goals),
            },
        }),
    }
}

async fn get_profile(State(s): State<AppState>, a: Authed) -> ApiResult {
    Ok(Json(profile_json(
        app::profile(&s.store, &a.actor, today()).await?.as_ref(),
    )))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileBody {
    sex: String,
    birth_year: i32,
    height_cm: String,
    weight_kg: String,
    activity: String,
    objective: String,
}

async fn put_profile(
    State(s): State<AppState>,
    a: Authed,
    body: Result<Json<ProfileBody>, JsonRejection>,
) -> ApiResult {
    let Json(b) = body?;
    let input = ProfileInput {
        sex: &b.sex,
        birth_year: b.birth_year,
        height_cm: &b.height_cm,
        weight_kg: &b.weight_kg,
        activity: &b.activity,
        objective: &b.objective,
    };
    let saved = app::set_profile(&s.store, &a.actor, input, today()).await?;
    Ok(Json(profile_json(Some(&saved))))
}

async fn analysis(State(s): State<AppState>, a: Authed, Query(q): Query<DateQuery>) -> ApiResult {
    let view = app::analysis(&s.store, &a.actor, &q.date).await?;
    let an = &view.analysis;
    let day = nutrient_totals(
        &view
            .day_entries
            .iter()
            .map(|e| &e.portion)
            .collect::<Vec<_>>(),
    );
    let opt = |v: Option<Decimal>| v.map(dec1);
    Ok(Json(json!({
        "from": format_date(view.from),
        "to": format_date(view.to),
        "periodDays": an.period_days,
        "daysLogged": an.days_logged,
        "goals": goals_json(&view.goals),
        "profile": profile_json(view.profile.as_ref()),
        "averages": {
            "kcal": dec1(an.avg_kcal),
            "burnedKcal": dec1(an.avg_burned_kcal),
            "netKcal": dec1(an.avg_kcal - an.avg_burned_kcal),
            "proteinG": dec1(an.avg_protein),
            "carbsG": dec1(an.avg_carbs),
            "fatG": dec1(an.avg_fat),
            "proteinPerKg": an.protein_per_kg.map(dec2),
        },
        "energySplit": an.energy_split.map(|(p, c, f)| json!({ "proteinPct": dec1(p), "carbsPct": dec1(c), "fatPct": dec1(f) })),
        "findings": an.findings.iter().map(|f| json!({
            "topic": f.topic.as_str(),
            "status": f.status.as_str(),
            "value": dec1(f.value),
            "min": opt(f.min),
            "max": opt(f.max),
        })).collect::<Vec<_>>(),
        "nutrients": an.nutrients.iter().zip(&day).map(|(w, d)| json!({
            "key": w.nutrient.key(),
            "reference": reference_json(w.reference),
            "dayAmount": dec2(d.amount),
            "dayKnown": d.known,
            "dayTotal": d.total,
            "weekAverage": dec2(w.average),
            "weekKnown": w.known,
            "weekTotal": w.total,
        })).collect::<Vec<_>>(),
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordBody {
    food_id: String,
    grams: String,
    date: String,
    meal: String,
}

async fn record_entry(
    State(s): State<AppState>,
    a: Authed,
    body: Result<Json<RecordBody>, JsonRejection>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let Json(b) = body?;
    let input = app::RecordFood {
        food_id: &b.food_id,
        grams: &b.grams,
        date: &b.date,
        meal: &b.meal,
    };
    let entry = app::record_food(&s.store, &a.actor, input).await?;
    Ok((StatusCode::CREATED, Json(entry_json(&entry))))
}

#[derive(Deserialize)]
struct GramsBody {
    grams: String,
}

async fn update_entry(
    State(s): State<AppState>,
    a: Authed,
    Path(id): Path<String>,
    body: Result<Json<GramsBody>, JsonRejection>,
) -> ApiResult<StatusCode> {
    let Json(b) = body?;
    app::update_entry(&s.store, &a.actor, &id, &b.grams).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_entry(
    State(s): State<AppState>,
    a: Authed,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    app::delete_entry(&s.store, &a.actor, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WaterBody {
    date: String,
    delta_ml: i64,
}

async fn change_water(
    State(s): State<AppState>,
    a: Authed,
    body: Result<Json<WaterBody>, JsonRejection>,
) -> ApiResult {
    let Json(b) = body?;
    let ml = app::change_water(&s.store, &a.actor, &b.date, b.delta_ml).await?;
    Ok(Json(json!({ "waterMl": ml.to_string() })))
}

#[derive(Deserialize)]
struct ActivityBody {
    date: String,
    name: String,
    kcal: String,
}

async fn add_activity(
    State(s): State<AppState>,
    a: Authed,
    body: Result<Json<ActivityBody>, JsonRejection>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let Json(b) = body?;
    let activity = app::add_activity(&s.store, &a.actor, &b.date, &b.name, &b.kcal).await?;
    Ok((StatusCode::CREATED, Json(activity_json(&activity))))
}

async fn delete_activity(
    State(s): State<AppState>,
    a: Authed,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    app::delete_activity(&s.store, &a.actor, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn not_found() -> ApiError {
    ApiError::NotFound
}

/// The `/api/v1` routes, with the same-origin check on state-changing requests.
pub fn api(state: AppState) -> Router {
    Router::new()
        .route("/session", get(session))
        .route("/auth/login", get(dev_login))
        .route("/auth/logout", post(logout))
        .route("/foods", get(list_foods).post(create_food))
        .route("/goals", get(get_goals).put(put_goals))
        .route("/diary", get(diary))
        .route("/diary/entries", post(record_entry))
        .route(
            "/diary/entries/{id}",
            patch(update_entry).delete(delete_entry),
        )
        .route("/water", post(change_water))
        .route("/profile", get(get_profile).put(put_profile))
        .route("/analysis", get(analysis))
        .route("/activities", post(add_activity))
        .route("/activities/{id}", axum::routing::delete(delete_activity))
        .fallback(not_found)
        .layer(middleware::from_fn_with_state(state.clone(), same_origin))
        .with_state(state)
}
