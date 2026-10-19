# Caloryst — agent instructions

- Read README.md and the relevant parts of docs/ARCHITECTURE.md before editing.
- Keep changes small, readable, and limited to the requested behavior. Apply Ponytail when available.
- The stack is proposed until explicitly accepted. Do not scaffold the application or install dependencies just to document a choice.
- Use idiomatic TypeScript for the proposed React frontend and idiomatic Rust for the proposed backend. Avoid unsafe Rust unless necessary; document its invariants.
- Never commit secrets, database dumps, personal food diaries, or real user health data.
- Validate input at API boundaries, use parameterized SQL, and preserve existing data during migrations.
- Keep calorie units, portion units, rounding, and diary dates explicit. Do not silently rewrite historical nutrition values when foods change.
- Follow docs/TOOLING.md. Use installed RTK compact commands where available; fall back to normal commands when unavailable.
- Use Context7 for current framework documentation. Use Superpowers selectively for complex features, difficult bugs, and substantial refactoring.
- Use Graphify for architecture questions when a project graph exists; keep generated graphs local. Do not generate a graph for a documentation-only repository.
- Use ast-grep for structural searches and Semgrep for targeted security audits when relevant and available.
- Do not install global tools or copy machine-specific settings into this repository without a request.
- Do not run unit or functional tests unless explicitly requested. Run requested formatting, lint, and build checks; report exactly what ran.
- Do not claim runtime, security, or performance validation unless performed.
- Do not use subagents unless the user asks for them.
