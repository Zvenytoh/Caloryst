# Contributing to Caloryst

Caloryst is at the project-initialization stage. Start by reading the README,
[architecture](docs/ARCHITECTURE.md), [engineering standards](docs/ENGINEERING.md),
and [AGENTS.md](AGENTS.md).

- Discuss substantial features before implementing them.
- Keep pull requests focused and explain the user-visible result.
- Describe the checks you actually ran and any remaining limitations.
- Never include credentials or personal nutrition records in issues or commits.
- Review the license and attribution requirements of any external food dataset.
- Preserve inward dependencies; business rules must not import HTTP/database frameworks.
- Describe ownership checks when adding access to private user data.
- Align API contracts, generated frontend types, migrations, and documentation when changing a boundary.

There are currently no application build, lint, or test commands. Add accurate
development instructions alongside the first implementation.
