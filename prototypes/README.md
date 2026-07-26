# Prototypes

Throwaway visual prototypes for exploring design directions before they earn a
spec. Not built, not linted, not tested — open the file directly in a browser.
Delete one once its question is settled and the answer is recorded in
`specs/` or `kb/decisions.md`.

## `radial-wave-field.html`

Explores the performer-perspective runway (owner direction, 2026-07-26): the
viewer stands *behind* the source, which faces away and radiates, so sound
travels away from the viewer instead of toward them.

| axis | meaning |
| --- | --- |
| x | pan / lateral position in the stereo field |
| y | time — newest at the source, oldest at the horizon |
| z | loudness, as height above the runway plane |
| z-stack | that track's spectrum, low at the base, high at the crest |
| hue | track identity; only intensity varies with spectral magnitude |

Every parameter is a live slider. The two questions it exists to answer:

1. **Arc** — sweep 0 → 100 to compare straight rows (every existing overlay
   keeps working) against arches.
2. **Height** — raise it until near peaks swallow the history behind them.
   That boundary is the real design constraint on the whole direction.

Data is synthetic and deterministic (no `Math.random`), standing in for CQT
frames plus an RMS envelope from the real analysis path.
