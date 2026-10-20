# Deployment

One Docker image (root `Dockerfile`) serves the PWA and the `/api/v1` Rust API on
port 8080. PostgreSQL runs as a separate service. Sign-in is delegated to a
[Better Auth](https://www.better-auth.com/) service that shares the database.

```text
https://kalo.example.com
  ├── /api/auth/*  → Better Auth service (Node)        ┐
  └── everything else → Kalo image (PWA + /api/v1)     ├── same PostgreSQL database
                                                        ┘
```

Keeping everything on **one domain** matters: the session cookie set by Better Auth
is then sent to the Kalo API, and no CORS configuration is needed.

## Environment variables (Kalo image)

| Variable | Required | Example | Purpose |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | yes | `postgres://kalo:SECRET@kalo-db:5432/kalo` | PostgreSQL connection. Use the internal host name of the database service. |
| `PUBLIC_ORIGIN` | yes | `https://kalo.example.com` | Exact public origin, no trailing slash. Writes from any other origin are rejected (CSRF protection). |
| `KALO_AUTH` | no | `better-auth` (default) | `dev` lets anyone sign in as one shared user: local development only, never public. |
| `BETTER_AUTH_COOKIE` | no | `__Secure-better-auth.session_token` | Only if you rename Better Auth's session cookie or set a cookie prefix. |
| `RUN_MIGRATIONS` | no | `true` (default) | Applies `apps/api/migrations` at startup. |
| `DATABASE_MAX_CONNECTIONS` | no | `10` (default) | Pool size. |
| `PORT` | no | `8080` (default) | Listening port. |
| `OFF_USER_AGENT` | recommended | `Kalo/0.1 (contact@example.com)` | Identifies the app to Open Food Facts ("AppName/Version (contact)"). Defaults to the repository URL. |
| `RUST_LOG` | no | `info` (default) | Log level. Logs never include diary contents or cookies. |
| `STATIC_DIR` | set by image | `/app/web` | Built PWA to serve. |

Build argument (Docker build, not runtime):

| Argument | Example | Purpose |
| :--- | :--- | :--- |
| `VITE_SIGN_IN_URL` | `/login` | Page opened by "Se connecter": your Better Auth sign-in page. |

## Dokploy

1. **Database**: create a PostgreSQL service (database `kalo`). Copy its
   *internal* connection URL; do not expose the database publicly.
2. **Application**: create an application from `Zvenytoh/Caloryst` and your branch.
   - Build type: **Dockerfile**, Dockerfile path `Dockerfile`, build context `.`
   - Build argument: `VITE_SIGN_IN_URL=/login` (once the login page exists)
   - Environment: `DATABASE_URL`, `PUBLIC_ORIGIN` (see the table)
3. **Domain**: add `kalo.example.com`, container port **8080**, HTTPS with Let's Encrypt.
   At your DNS provider, point an `A` record for that name to the Dokploy server's IP.
4. Deploy, then check `https://kalo.example.com/readyz` returns `ready`.

## Better Auth (to set up)

The Kalo API reads Better Auth's default PostgreSQL tables:
`"session"` (`token`, `"userId"`, `"expiresAt"`) and `"user"` (`id`, `name`).

- Point Better Auth at the **same** `DATABASE_URL` and run its migrations.
- Set `BETTER_AUTH_SECRET` (random, at least 32 characters) and
  `BETTER_AUTH_URL=https://kalo.example.com` in the Better Auth service only.
- Mount it on the same domain under `/api/auth` (Dokploy domain with path `/api/auth`).
- Keep the default table and column names; if you change them (or use `usePlural`),
  `apps/api/src/identity.rs` must follow.
- Until Better Auth's tables exist, the app shows the sign-in screen and nobody can sign in.

Sign-out from the app calls `POST /api/v1/auth/logout`, which deletes the session row
and clears the cookie.

## Food catalogs

- **CIQUAL 2025** (ANSES, Licence Ouverte Etalab 2.0, doi:10.57745/RDMHWY) is bundled as
  `apps/api/data/ciqual-2025.tsv` and loaded into `catalog_foods` at the first start of each
  version (about one second). Regenerate it with `apps/api/data/convert_ciqual.py`.
- **Open Food Facts** (ODbL) is queried live through the API: search and barcode lookups are
  limited to 8 and 12 requests per minute per server (OFF allows 10 and 15 per IP), and every
  product returned is cached in `catalog_foods`. Over the limit, users get a "retry in a minute"
  message. The server needs outbound HTTPS to `search.openfoodfacts.org` and `world.openfoodfacts.org`.
- The app shows both attributions next to search results. A public copy of the cached Open
  Food Facts data must be shared under ODbL.

## Known limits

- Migrations run with the application's database role at startup. The architecture
  recommends a separate migration role; split them before handling real user data.
- No rate limiting yet: add it at the proxy (Traefik) before opening sign-up publicly.
- Backups, retention and account deletion are not implemented.
