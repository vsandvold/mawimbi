// Shared by every CQT-adjacent test (offline, live, worklet, worker paths)
// that asserts a synthetic tone lands at the expected bin — the 12-TET
// guard pattern (kb/verification.md).
export function findPeakBin(frame: Uint8Array): number {
  let peak = 0;
  for (let i = 1; i < frame.length; i++) {
    if (frame[i] > frame[peak]) peak = i;
  }
  return peak;
}
