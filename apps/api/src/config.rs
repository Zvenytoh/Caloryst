//! Startup configuration from environment variables, validated once.

use crate::identity::AuthMode;
use std::{env, net::SocketAddr, path::PathBuf};

pub struct Config {
    pub database_url: String,
    pub database_max_connections: u32,
    pub run_migrations: bool,
    /// Public origin of the web app, e.g. `https://kalo.example.com`; state-changing
    /// requests must come from it (CSRF protection).
    pub public_origin: String,
    pub auth: AuthMode,
    pub listen: SocketAddr,
    /// Built frontend to serve; `None` runs the API alone.
    pub static_dir: Option<PathBuf>,
}

fn var(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty())
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let database_url = var("DATABASE_URL").ok_or("DATABASE_URL is required")?;
        let public_origin = var("PUBLIC_ORIGIN")
            .ok_or("PUBLIC_ORIGIN is required, e.g. https://kalo.example.com")?;
        if !(public_origin.starts_with("https://") || public_origin.starts_with("http://"))
            || public_origin.ends_with('/')
        {
            return Err("PUBLIC_ORIGIN must be a scheme and host without a trailing slash".into());
        }
        let auth = match var("KALO_AUTH").as_deref().unwrap_or("better-auth") {
            "better-auth" => AuthMode::BetterAuth {
                cookies: match var("BETTER_AUTH_COOKIE") {
                    Some(name) => vec![name],
                    None => vec![
                        "__Secure-better-auth.session_token".into(),
                        "better-auth.session_token".into(),
                    ],
                },
            },
            "dev" => AuthMode::Dev,
            other => return Err(format!("KALO_AUTH must be better-auth or dev, got {other}")),
        };
        let port: u16 =
            var("PORT").map_or(Ok(8080), |p| p.parse().map_err(|_| "PORT must be a number"))?;
        let database_max_connections = var("DATABASE_MAX_CONNECTIONS").map_or(Ok(10), |n| {
            n.parse()
                .map_err(|_| "DATABASE_MAX_CONNECTIONS must be a number")
        })?;
        Ok(Self {
            database_url,
            database_max_connections,
            run_migrations: var("RUN_MIGRATIONS").as_deref() != Some("false"),
            public_origin,
            auth,
            listen: SocketAddr::from(([0, 0, 0, 0], port)),
            static_dir: var("STATIC_DIR").map(PathBuf::from),
        })
    }
}
