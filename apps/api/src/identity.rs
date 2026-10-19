//! Maps a session cookie to a verified user.
//!
//! Better Auth mode reads the `session` and `user` tables that Better Auth creates in the
//! same database (default schema, camelCase columns). Dev mode issues local sessions and
//! must never be enabled on a public deployment.

use sqlx::PgPool;
use uuid::Uuid;

pub const DEV_COOKIE: &str = "kalo_dev_session";
const DEV_SESSION_DAYS: i32 = 30;

#[derive(Clone)]
pub enum AuthMode {
    /// Cookie names to try, e.g. `__Secure-better-auth.session_token`.
    BetterAuth {
        cookies: Vec<String>,
    },
    Dev,
}

#[derive(Clone)]
pub struct Identity {
    pool: PgPool,
    mode: AuthMode,
}

pub struct Session {
    pub user_id: String,
    pub display_name: String,
    pub token: String,
}

/// Session tokens are opaque random strings; anything else is ignored.
fn plausible_token(token: &str) -> bool {
    (16..=256).contains(&token.len())
        && token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn cookie<'a>(header: &'a str, name: &str) -> Option<&'a str> {
    header
        .split(';')
        .filter_map(|c| c.trim().split_once('='))
        .find(|(k, _)| *k == name)
        .map(|(_, v)| v)
}

impl Identity {
    pub fn new(pool: PgPool, mode: AuthMode) -> Self {
        Self { pool, mode }
    }

    pub fn is_dev(&self) -> bool {
        matches!(self.mode, AuthMode::Dev)
    }

    /// Resolves the session from a `Cookie` header; `Ok(None)` means not signed in.
    pub async fn resolve(&self, cookie_header: &str) -> Result<Option<Session>, sqlx::Error> {
        match &self.mode {
            AuthMode::BetterAuth { cookies } => {
                // Better Auth signs the cookie as "<token>.<signature>"; the token alone is the
                // unguessable lookup key stored in its session table.
                let Some(token) = cookies
                    .iter()
                    .find_map(|name| cookie(cookie_header, name))
                    .map(|v| v.split('.').next().unwrap_or_default())
                    .filter(|t| plausible_token(t))
                else {
                    return Ok(None);
                };
                let row: Option<(String, String)> = match sqlx::query_as(
                    r#"SELECT s."userId", u.name FROM "session" s JOIN "user" u ON u.id = s."userId"
                       WHERE s.token = $1 AND s."expiresAt" > now()"#,
                )
                .bind(token)
                .fetch_optional(&self.pool)
                .await
                {
                    // 42P01 undefined_table: Better Auth has not run its migrations yet.
                    Err(err)
                        if err.as_database_error().and_then(|e| e.code()).as_deref()
                            == Some("42P01") =>
                    {
                        tracing::warn!(
                            "Better Auth tables \"session\"/\"user\" not found; nobody can sign in yet"
                        );
                        None
                    }
                    other => other?,
                };
                Ok(row.map(|(user_id, display_name)| Session {
                    user_id,
                    display_name,
                    token: token.to_owned(),
                }))
            }
            AuthMode::Dev => {
                let Some(token) = cookie(cookie_header, DEV_COOKIE).filter(|t| plausible_token(t))
                else {
                    return Ok(None);
                };
                let row: Option<(String, String)> =
                    sqlx::query_as("SELECT user_id, display_name FROM dev_sessions WHERE token = $1 AND expires_at > now()")
                        .bind(token)
                        .fetch_optional(&self.pool)
                        .await?;
                Ok(row.map(|(user_id, display_name)| Session {
                    user_id,
                    display_name,
                    token: token.to_owned(),
                }))
            }
        }
    }

    /// Dev mode only: opens a session for the shared local user and returns its token.
    pub async fn dev_sign_in(&self) -> Result<String, sqlx::Error> {
        // shortcut: dev tokens are stored as-is; Better Auth owns real session storage.
        let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        sqlx::query(
            "INSERT INTO dev_sessions (token, user_id, display_name, expires_at)
             VALUES ($1, 'dev-user', 'Dev', now() + make_interval(days => $2))",
        )
        .bind(&token)
        .bind(DEV_SESSION_DAYS)
        .execute(&self.pool)
        .await?;
        Ok(token)
    }

    /// Revokes a session server-side so the cookie stops working everywhere.
    pub async fn revoke(&self, token: &str) -> Result<(), sqlx::Error> {
        let query = match self.mode {
            AuthMode::BetterAuth { .. } => r#"DELETE FROM "session" WHERE token = $1"#,
            AuthMode::Dev => "DELETE FROM dev_sessions WHERE token = $1",
        };
        sqlx::query(query).bind(token).execute(&self.pool).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_named_cookie() {
        let header = "a=1; __Secure-better-auth.session_token=abcdefghijklmnop1234.sig%3D; b=2";
        let value = cookie(header, "__Secure-better-auth.session_token").unwrap();
        assert_eq!(value.split('.').next(), Some("abcdefghijklmnop1234"));
        assert!(!plausible_token("short"));
        assert!(!plausible_token("abcdefghijklmnop' OR 1=1"));
    }
}
