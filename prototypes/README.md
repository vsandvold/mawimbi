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

The field is an **inverted cone**: waves leave a narrow mouth and widen as
they age. Whether that reads as *expanding* or as *receding* is governed by
`Camera` against `Mouth` — apparent width goes as
`(mouth + age) / (camera + age)`, so the cone widens only while the camera
sits further back than the mouth is wide. Nothing is clipped at the frame
edge; `Haze` is what ends the cone.

Every parameter is a live slider. The questions it exists to answer:

1. **Camera vs. Mouth** — where the cone stops running away and starts
   receding.
2. **Arc** — sweep 0 → 100 to compare straight rows (every existing overlay
   keeps working) against true radiation.
3. **Height** — raise it until near peaks swallow the history behind them.
   That boundary is the real design constraint on the whole direction.

Data is synthetic and deterministic (no `Math.random`), standing in for CQT
frames plus an RMS envelope from the real analysis path.
