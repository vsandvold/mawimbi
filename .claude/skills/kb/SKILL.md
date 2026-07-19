---
name: kb
description: Read or write the compounding knowledge base in kb/. Use "read" to ground yourself before planning a spec or nontrivial task; use "write" to capture durable learnings (business rules, domain knowledge, decisions, verification patterns) before finishing a session or after merging a PR.
argument-hint: read [topic] | write
---

# Knowledge Base

The KB lives in `kb/` at the repo root (`INDEX.md` is the map). It compounds: every session reads it to avoid re-deriving context, and writes back what it learned so the next session starts smarter.

## /kb read

1. Read `kb/INDEX.md`, then every KB file plausibly relevant to the task at hand (they are deliberately short — when in doubt, read all of them).
2. Treat entries as **grounding, not gospel**: if code or issues contradict a KB entry, the entry may be stale — verify against the source, act on what's true, and queue a correction for `/kb write`.
3. When you use a KB fact in a spec or plan, cite the file (e.g. "per `kb/product.md`, local-first — no backend").

## /kb write

Run near the end of a session (or right after a PR merges). Distill what this session learned, then filter hard:

**Include** only entries that are all three of:
- **Durable** — still true and useful months from now (not "test X was flaky today").
- **Non-derivable** — costs real effort to rediscover from the code (rationale, tradeoffs, domain facts, failed approaches), rather than being obvious from reading one file.
- **New** — not already captured in the KB or CLAUDE.md. Update-in-place beats appending a near-duplicate.

**Routing** (see the boundary note in `kb/INDEX.md`):
- How-to-work-here learnings (commands, environment quirks, coding gotchas) → CLAUDE.md, not the KB.
- Product/business rules → `kb/product.md`. Domain facts → `kb/domain.md`. Decisions with rationale → `kb/decisions.md` (newest first; supersede, never delete). Verification lessons → `kb/verification.md`.
- A learning that fits no existing file: create a new `kb/<topic>.md` and add it to `INDEX.md`.

**Format:** short declarative statements with provenance (issue/PR number or file path). No session narration.

**Hygiene:** keep each file under ~150 lines — when one outgrows that, split it and update `INDEX.md`. Run `bash scripts/check-harness.sh` after writing.
