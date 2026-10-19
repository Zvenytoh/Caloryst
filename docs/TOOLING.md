# Development tools

This guide describes intended usage. It does not install tools or imply that
every contributor has them. Global tools and agent skills are optional helpers,
not application dependencies.

| Tool | When to use it | Setup / scope |
| --- | --- | --- |
| AGENTS.md | Every project: repository rules and constraints | Versioned file at the repository root |
| RTK | Routine Git, build, lint, and requested test commands | Global CLI; use compact forms when installed |
| Ponytail | Keep implementation small and straightforward | Global agent skill |
| Superpowers | Complex features, difficult bugs, substantial refactoring | Global skills, invoked selectively |
| Graphify | Architecture and dependency exploration as the codebase grows | Per-project graph; generated output stays local |
| ast-grep | Structural code search and targeted refactoring | Global CLI |
| Context7 | Verify current framework and library documentation | Global MCP connection |
| Semgrep | Focused security and static-analysis reviews | Global CLI, run when relevant |
| OpenAI Skills | Specialized work such as logos, documents, or frontend tasks | Selected skills available to the contributor's agent |

Do not run every tool on every change. No application code exists yet, so there
is no reason to generate a code graph, run a structural refactor, or claim a
security audit. No global installation or agent configuration is included here.

Unit and functional tests run only when explicitly requested. Document actual
commands and results; never report checks that were not performed.
