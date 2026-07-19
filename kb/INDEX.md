# Knowledge Base Index

Compounding knowledge captured across agent sessions. **Read before planning; write after delivering.** The read/write protocol lives in `.claude/skills/kb/SKILL.md` (`/kb`).

| File | Contents |
| --- | --- |
| `product.md` | Product vision, target user, business rules |
| `domain.md` | Audio and music domain knowledge behind the features |
| `decisions.md` | Architectural decisions with rationale and provenance |
| `environment.md` | Observed remote-environment incidents — the evidence behind CLAUDE.md's operational guidance |
| `verification.md` | Catalog of verification patterns that work (and fail) in this repo |

## Boundary with CLAUDE.md

CLAUDE.md is the **operating manual**: commands, conventions, environment quirks, coding gotchas — what you need to work in this repo without breaking things. The KB holds **what the product is and why it is built this way**: business rules, domain facts, decision rationale, verification know-how. A learning that changes how you write or test code belongs in CLAUDE.md; a learning about the product, domain, or the reasoning behind a design belongs here. Never duplicate content across the two — link instead. `/harness-audit` checks this boundary.
