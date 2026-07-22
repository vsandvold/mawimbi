// Shared between SpectrogramTileRenderer.ts (tile rendering) and
// Spectrogram.tsx (draw-time geometry) so both sides of the tile-height
// contract can never drift apart (mawimbi#539, spec 006 milestone 2).
//
// 1024 frames × 25ms hop = 25.6s per tile — dropped from the original 4096
// (102.4s) so a chunked analysis emits its first visible tile roughly 4x
// sooner, and every later chunk lands at the same granularity.
export const TILE_FRAMES = 1024;
