---
name: council
description: Deliberate a design question from multiple adversarial perspectives before committing to an approach. Use during spec planning (mandatory), before architecturally significant decisions, or whenever torn between approaches. Produces a decision record with explicit dissent.
argument-hint: <the question to deliberate>
---

# Council

Attack a problem from several angles *before* writing the spec or the code, so the first design survives contact with reality. The output is a decision, its rationale, and the recorded dissent — not consensus theater.

## 1. Frame the question

Write down, concretely: the question, the constraints (from `/kb read`, CLAUDE.md, and the code), and 2–4 candidate approaches if any are already visible. A vague question produces a vague council.

## 2. Convene the council

Pick **3–5 lenses** that genuinely conflict for this question:

| Lens | Asks |
| --- | --- |
| **Architect** | Does this fit the existing structure (signals ownership, service state machines, package-by-feature)? What does it cost to extend later? |
| **Adversary** | How does this break? Race conditions, edge cases, the bug classes this repo has already shipped (`kb/decisions.md`, CLAUDE.md gotchas). Argues against every other lens's favorite. |
| **Simplicity** | What is the smallest thing that works? Which parts of the proposal are speculative? (CLAUDE.md: "Do the simplest thing that works.") |
| **Product** | Does this serve the creative amateur (`kb/product.md`)? Mobile-first? Does it protect the visual identity? |
| **Verification** | How will an agent *prove* this works autonomously (`kb/verification.md`)? If a claim can't be falsified by a test, the design must change until it can. Always include this lens. |
| **Performance** | Audio-thread budget, canvas memory, layout thrash — only when the question touches the rAF/audio path. |

Spawn one subagent per lens **in a single message** (parallel, `run_in_background: false` — this environment's disk reclaimer can silently kill background agents; verify every agent actually returned output). Each prompt gets: the framed question, constraints, repo pointers, its lens, and the required return shape:

1. Position (which approach, or a new one)
2. Strongest argument **against** the other approaches
3. Top 2 risks of its own position
4. What evidence would change its mind

For small questions, run the council inline instead: write each lens's position yourself, honestly, before synthesizing.

## 3. Synthesize

- List agreements (usually settled — move on).
- For each disagreement, resolve with **evidence from the code or issues**, not by counting votes. If evidence is missing, go get it (read the code, run an experiment) before deciding.
- Write the decision record: **Decision / Rationale / Dissent** (what the losing lenses predicted — this is what `/harness-audit` and future sessions check against reality).

## 4. File the record

Inside a `/spec` run: the record goes in the spec's Design section. Standalone: append it to `kb/decisions.md`.
