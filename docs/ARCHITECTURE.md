# Architecture discussion

## Status

Documentation only; no application code yet. The stack and first-release scope
below were accepted on 2026-10-19.

## Accepted decisions

- **Platform:** a mobile-friendly web app delivered as a Progressive Web App
  (installable, responsive). No native client for the first release.
- **Users:** multi-user with accounts from the start. Every food diary row
  belongs to a user. Users must be able to export and delete their data.
- **Food data:** imported reference catalogs from [CIQUAL](https://ciqual.anses.fr/)
  (ANSES, generic foods, Licence Ouverte / Etalab 2.0) and
  [Open Food Facts](https://fr.openfoodfacts.org/data) (branded products and
  barcodes, ODbL), plus foods created manually by users.
- **Stack:** React + TypeScript + Vite frontend, Rust + Axum backend, SQLx,
  PostgreSQL.

## Food data licensing

- Keep the source (`ciqual`, `openfoodfacts`, `user`) and the source identifier
  on every catalog food, and keep imported data separate from user-created foods.
- Display attribution for both sources in the app and the README.
- Open Food Facts data is under ODbL: any derived database made public must be
  shared under ODbL. User diaries are not part of the shared catalog.
- Re-imports update catalog foods but never rewrite diary snapshots.

## Architecture

```text
React + TypeScript PWA
              |
          JSON / HTTP
              |
        Rust + Axum API
              |
         SQLx queries
              |
          PostgreSQL
```

Use a single backend deployment and a single database initially. No microservices,
message broker, or cache is justified by the current requirements.

React fits the interactive diary and food-entry forms. TypeScript makes component
and API data contracts explicit. Vite builds the client and its PWA manifest and
service worker; the API stays a separate service.

Rust + Axum gives strong compile-time guarantees at the cost of some initial work
around async code and error handling. PostgreSQL suits related users, foods,
portions, and diary entries. SQLx keeps SQL and migrations explicit without an
ORM layer. Catalog imports run as a separate command, not inside request handlers.

## Nutrition data principles for implementation

- Distinguish kcal from kJ and grams from serving counts.
- Define decimal precision and rounding once; round for display deliberately.
- Consider fixed-scale decimal columns for stored quantities and energy values.
- Keep the nutrition values used by a diary entry as a historical snapshot.
- Associate daily entries with the user's intended date and time zone.
- Validate portions and nutrition values before calculating totals.

These are design recommendations; no schema or calculation engine exists yet.

## Open decisions

- Authentication method (server sessions with secure cookies vs. tokens, password
  hashing, email verification and password reset).
- Hosting and deployment target.
- Offline behaviour of the PWA: read-only cache or offline entry with sync.
- Interface languages (French first, English, or both).
- Which Open Food Facts subset to import (full dump vs. country or completeness filter).

## Documentation references

- [React: building an app from scratch](https://react.dev/learn/build-a-react-app-from-scratch)
- [Axum](https://github.com/tokio-rs/axum)
- [SQLx](https://github.com/launchbadge/sqlx)
- [PostgreSQL numeric types](https://www.postgresql.org/docs/18/datatype-numeric.html)
