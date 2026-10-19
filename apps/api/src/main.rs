mod config;
mod http;
mod identity;
mod postgres;

use axum::{
    Router,
    extract::{DefaultBodyLimit, Request, State},
    http::{HeaderValue, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use config::Config;
use sqlx::{PgPool, postgres::PgPoolOptions};
use std::time::Duration;
use tower_http::{
    services::{ServeDir, ServeFile},
    set_header::SetResponseHeaderLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();
    if let Err(message) = run().await {
        tracing::error!("{message}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let config = Config::from_env()?;
    let pool = PgPoolOptions::new()
        .max_connections(config.database_max_connections)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&config.database_url)
        .await
        .map_err(|e| format!("cannot connect to PostgreSQL: {e}"))?;
    if config.run_migrations {
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(|e| format!("migrations failed: {e}"))?;
    }

    let identity = identity::Identity::new(pool.clone(), config.auth.clone());
    if identity.is_dev() {
        tracing::warn!(
            "KALO_AUTH=dev: anyone can sign in as the shared dev user. Never use this in production."
        );
    }
    let state = http::AppState {
        store: postgres::PgStore::new(pool.clone()),
        identity,
        public_origin: config.public_origin.clone(),
    };

    let api = http::api(state)
        .layer(DefaultBodyLimit::max(16 * 1024))
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ));
    let mut app = Router::new()
        .nest("/api/v1", api)
        .route("/healthz", get(|| async { "ok" }))
        .route("/readyz", get(ready).with_state(pool));
    if let Some(dir) = &config.static_dir {
        // Unknown paths fall back to the app shell; the frontend owns client-side routes.
        let files = ServeDir::new(dir).fallback(ServeFile::new(dir.join("index.html")));
        app = app
            .fallback_service(files)
            .layer(middleware::from_fn(static_cache));
    }
    let app = app
        .layer(TimeoutLayer::with_status_code(
            StatusCode::SERVICE_UNAVAILABLE,
            Duration::from_secs(15),
        ))
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(config.listen)
        .await
        .map_err(|e| format!("cannot listen on {}: {e}", config.listen))?;
    tracing::info!("listening on {}", config.listen);
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await
        .map_err(|e| format!("server error: {e}"))
}

async fn ready(State(pool): State<PgPool>) -> Response {
    match sqlx::query("SELECT 1").execute(&pool).await {
        Ok(_) => "ready".into_response(),
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

/// Hashed build assets never change; everything else must be revalidated.
async fn static_cache(request: Request, next: Next) -> Response {
    let immutable = request.uri().path().starts_with("/assets/");
    let is_api = request.uri().path().starts_with("/api/");
    let mut response = next.run(request).await;
    if !is_api && !response.headers().contains_key(header::CACHE_CONTROL) {
        let value = if immutable {
            "public, max-age=31536000, immutable"
        } else {
            "no-cache"
        };
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static(value));
    }
    response
}

async fn shutdown() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut signal) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            signal.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }
    tracing::info!("shutting down");
}
