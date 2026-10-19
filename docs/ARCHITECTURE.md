# Architecture discussion

## Status

Documentation only. React is the requested frontend direction, PostgreSQL is the
requested database direction, and Rust is under consideration for the backend.
TypeScript, Vite, Axum, and SQLx are recommendations, not finalized decisions.

## Recommended starting point

```text
React + TypeScript web interface
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
and API data contracts more explicit. Vite is a suitable build tool for a client
application backed by a separate API.

Rust is a reasonable choice if learning or maintaining Rust is part of the goal.
It offers strong compile-time guarantees but adds initial development work around
async code, error handling, and integration. A TypeScript backend is an alternative
if shipping quickly with one language matters more. Calorie counting alone does
not require Rust's performance characteristics.

PostgreSQL suits related foods, portions, and diary entries. SQLx would keep SQL
and migrations explicit without adding a separate ORM model layer.

## Nutrition data principles for implementation

- Distinguish kcal from kJ and grams from serving counts.
- Define decimal precision and rounding once; round for display deliberately.
- Consider fixed-scale decimal columns for stored quantities and energy values.
- Keep the nutrition values used by a diary entry as a historical snapshot.
- Associate daily entries with the user's intended date and time zone.
- Validate portions and nutrition values before calculating totals.

These are design recommendations; no schema or calculation engine exists yet.

## Open decisions

- Web-only first release, mobile-friendly web, or a later native client?
- Manual food entry, an external food database, or both? Review data licensing before importing a catalog.
- Personal use, self-hosted multi-user use, or a hosted service?
- Accounts, data export/deletion, and the precise first-release scope.

## Documentation references

- [React: building an app from scratch](https://react.dev/learn/build-a-react-app-from-scratch)
- [Axum](https://github.com/tokio-rs/axum)
- [SQLx](https://github.com/launchbadge/sqlx)
- [PostgreSQL numeric types](https://www.postgresql.org/docs/18/datatype-numeric.html)
