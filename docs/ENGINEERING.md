# Engineering standards

**Status: implementation guidance.** This document creates no source code,
configuration, or CI. Follow the [architecture](ARCHITECTURE.md) for boundaries.

## Rust

- Use stable Rust; pin the toolchain when creating the workspace. Commit the
  workspace Cargo.lock because this repository delivers an application.
- Prefer private fields, narrow visibility, descriptive enums, validated value
  types, and fallible constructors. Keep public APIs small.
- Return typed `Result` errors for expected failures and propagate with `?`.
  No `unwrap`, `expect`, or panic for user input, database, or network failures.
- Borrow where useful; clone deliberately. Do not wrap every object in `Arc`.
- Use generics at real adapter boundaries, not a trait for every struct. Prefer
  explicit dependencies to global state or a service locator.
- Keep synchronous domain work independent of async I/O. Isolate blocking or long
  CPU work rather than blocking Tokio workers, if such work becomes necessary.
- Default to safe Rust; no unsafe is currently justified.
- Use standard rustfmt and Clippy. Do not globally silence warnings to pass a build.

## Axum

- Keep handlers thin: extract, decode, call the use case, map its result.
- Provide small cloneable state with application services. The database pool
  stays behind persistence adapters rather than being used directly in handlers.
- Extract a verified actor from the session. Every private use case checks
  ownership; a frontend route guard is only a presentation aid.
- Keep DTOs and `IntoResponse` implementations in HTTP code, outside core errors.
- Normalize extractor rejections and fallible middleware errors into safe responses.
- Set request/body limits and timeouts. Review middleware order explicitly,
  including tracing, CSRF, session extraction, and error mapping.
- Validate config once and support graceful shutdown.

## PostgreSQL and SQLx

- Parameterize values. Allowlist dynamic identifiers and sort directions;
  SQL bind parameters cannot substitute identifiers.
- Map driver errors and rows inside adapters. Use domain constructors instead
  of bypassing validation when loading persisted values.
- Use one bounded pool and short transactions. Do not report a successful write
  until its transaction commits.
- Include ownership in private queries. Review relational ownership constraints,
  cascading deletes, and diary-history preservation.
- Pair range checks with `NOT NULL`. Use unique/foreign keys for relational
  invariants. Reject numeric NaN as well as invalid ranges.
- Add indexes from real query patterns, starting with owner/date diary access.
  Bound list queries and avoid per-row follow-up requests.
- Never rewrite applied migrations. Keep SQL line endings LF and separate
  migration credentials from runtime credentials.
- If using checked query macros, version `.sqlx/` metadata and refresh it against
  the migrated schema. Offline compilation alone does not prove migrations work.

## React and TypeScript

- Enable `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
  See [strict][strict], [index access][index], and [optional properties][optional].
- Treat network JSON and caught errors as `unknown`; narrow or validate at the
  boundary. Avoid `any`, unchecked casts, and non-null assertions as shortcuts.
- Use function components, Rules of Hooks, small purposeful hooks, and stable
  domain IDs as list keys.
- Keep form and selection state local. Derive values from existing state/props
  rather than synchronizing redundant copies with effects.
- Effects synchronize external systems and clean up subscriptions or requests.
  Prevent stale responses from overwriting the newly selected day's data.
- Keep transport and runtime response parsing outside rendering components.
  Introduce view models only where conversion serves a concrete purpose.
- Use discriminated unions for meaningful loading/error/success state combinations.
- The API is authoritative for ownership and nutrition totals. Browser validation
  improves feedback; it does not replace server validation.
- Use semantic HTML, labels, visible keyboard focus, clear field errors, and
  usable small-screen layouts. Do not communicate status through color alone.
- Do not render untrusted content using `dangerouslySetInnerHTML`.
- Add global state, query caching, memoization, or UI libraries only for a real
  need. Do not introduce a frontend dependency-injection framework by default.
- Choose one package manager and commit its lockfile. Select lint/format settings
  when scaffolding rather than inventing scripts in documentation.

## PWA

- Treat PWA code as delivery infrastructure; keep it out of nutrition/business rules.
- Provide manifest/install icons, HTTPS delivery, standalone layouts, and a useful
  website fallback. Feature-detect installation APIs instead of assuming support.
- Precache only allowlisted public shell assets. Explicitly bypass API, session,
  and auth routes; private responses must not enter Cache Storage or IndexedDB.
- Begin with an offline connection-required screen. Do not queue writes or claim
  entries were saved when the server has not confirmed them.
- Keep worker/cache versions consistent with the frontend build. Prompt for an
  update without discarding unsaved forms or breaking other open tabs.
- Revalidate on resume and clear private UI state across tabs after logout or
  account switching. Never clear unrelated origin caches during cleanup.
- Verify installation, offline boundaries, and update behavior on the agreed
  browser/device matrix before claiming PWA support. See the
  [PWA design](ARCHITECTURE.md#10-pwa-delivery-and-lifecycle).

## Contracts and privacy

- Align OpenAPI and generated wire types. TypeScript alone cannot validate JSON.
- Send decimals as strings and dates in explicit formats. Distinguish absent
  fields from `null`, especially for partial updates.
- Keep secrets out of the frontend bundle. Never log full diary bodies, cookies,
  tokens, connection strings, or identity-provider credentials.
- Rotate sessions at sign-in and revoke them on logout/account deletion.

## Intended checks once implementation exists

These are validation targets, not available repository commands.

| Area | Intended validation |
| :--- | :--- |
| Rust formatting | Standard cargo fmt check |
| Rust static analysis | Clippy, warnings denied on supported targets |
| Rust compilation | Locked workspace build |
| Frontend | Strict type check, React Hooks lint, formatting, production build |
| PWA, when requested | Installability, offline shell, private-cache exclusion, updates, cross-tab sessions |
| Contracts | OpenAPI and generated-type drift |
| Persistence | Migrations and checked-query metadata against PostgreSQL |
| Tests, when requested | Domain edge cases, use-case policy, transactions, cross-user access, UI interactions |

Do not invent commands before manifests/scripts exist. Run unit or functional
tests only on explicit request. Report exact checks performed; compilation is
not runtime, security, accessibility, or performance validation.

## Sources

The [architecture reference list](ARCHITECTURE.md#references) contains the Rust,
Axum, SQLx, PostgreSQL, React, and identity sources used for these recommendations.

[strict]: https://www.typescriptlang.org/tsconfig/strict.html
[index]: https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html
[optional]: https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html
