# Specs

Specifications for features and chunks of work, created with `/spec` and broken into GitHub issues with `/spec-to-issues`. See the Agent Harness section in `CLAUDE.md`.

- Naming: `NNN-slug.md`, NNN = next free number.
- Every spec carries a `**Status:**` line: `Draft → Issues filed → In progress → Delivered → Superseded`. `/harness-audit` syncs statuses with GitHub reality.
- The spec template lives at `.claude/skills/spec/template.md`.
- Specs are grounded documents: claims cite the knowledge base (`kb/`), issues/PRs, or code. Requirements without a runnable verification (or an explicit human-QA flag) don't belong in a spec.
