<div align="center">
  <img src="assets/logo.png" width="128" height="128" alt="Caloryst logo">
  <h1>Caloryst</h1>
  <p><strong>An open-source calorie counter.</strong></p>
  <p>A simple way to understand your daily food intake.</p>
  <p><a href="LICENSE">MIT License</a> · <a href="CONTRIBUTING.md">Contributing</a> · <a href="docs/ARCHITECTURE.md">Architecture</a></p>
</div>

## About

Caloryst is an open-source project for tracking food intake and daily calories.
The aim is to make everyday logging clear, practical, and accessible.

**Status: project initialization.** This repository currently contains the project
documentation and logo. There is no runnable application yet. The technology
choices below are accepted but not implemented.

## First milestone

- Create an account and sign in.
- Search foods from CIQUAL and Open Food Facts, or add your own.
- Record food entries in a daily diary.
- View daily calorie totals.

These are planned goals, not shipped features. Caloryst is a mobile-friendly
Progressive Web App. Hosting and authentication details remain to be decided.

## Technology stack

| Layer | Choice | Purpose |
| --- | --- | --- |
| Frontend | React + TypeScript, built with Vite | Responsive, installable PWA |
| Backend | Rust + Axum | JSON HTTP API and nutrition calculations |
| Database | PostgreSQL | Relational storage for foods and diary entries |
| Database access | SQLx | Explicit SQL queries and versioned migrations |

Start with one web frontend, one backend, and one database. See
[architecture notes](docs/ARCHITECTURE.md) for decisions and open questions.

## Food data

Caloryst will use the [CIQUAL](https://ciqual.anses.fr/) table from ANSES
(Licence Ouverte / Etalab 2.0) and [Open Food Facts](https://fr.openfoodfacts.org/data)
(Open Database License). See [food data licensing](docs/ARCHITECTURE.md#food-data-licensing).

## Getting started

```sh
git clone https://github.com/Zvenytoh/Caloryst.git
cd Caloryst
```

There are no application setup, build, or test commands yet. They will be
documented when the implementation is introduced.

## Contributing

Ideas, bug reports, and focused contributions are welcome. Read
[CONTRIBUTING.md](CONTRIBUTING.md) and the project rules in [AGENTS.md](AGENTS.md)
before making changes. The [tooling guide](docs/TOOLING.md) explains when to use
the development tools.

## License

Caloryst is released under the [MIT License](LICENSE), including the project logo.
