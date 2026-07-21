import { midiNoteToBin } from '../src/features/spectrogram/PianoRollRenderer';
import { computeNumberBins } from '../src/features/spectrogram/CQTAnalyser';
import {
  computeBarCenterX,
  computeMeterRect,
} from '../src/features/workstation/scrubber/loudnessMeterRenderer';
import { activeRunwayConfig } from '../src/features/workstation/scrubber/runwayConfig';
import { expect, test, uploadAudioFile, SHORT_AUDIO } from './fixtures';
import { getFirstTrackId, waitForMelody } from './helpers/mawimbiBridge';
import { decodeClip, hasWarmAccentPixelInColumns } from './helpers/pixelDecode';

/**
 * Proving e2e for the melody path (mawimbi#480, spec 003 milestone 1).
 *
 * Establishes that real Basic Pitch transcription — the model is
 * self-hosted in public/basic-pitch-model/, so the fixtures' ONNX-download
 * block (blockModelRequests) doesn't apply to it — is fast and
 * deterministic enough in this e2e environment to use directly, without a
 * dev-only injection seam: ~6-11s per upload (cold model load on the first
 * upload of a run, ~6-8s on subsequent ones), and repeat runs against the
 * same fixture produce the identical note (see kb/verification.md).
 *
 * Reads the transcribed melody through the dev-only e2e bridge
 * (`window.__mawimbi`, wired in AudioService.ts, gated to
 * `import.meta.env.DEV` — always true here since e2e runs against
 * `npm start`). A direct state read is preferred over screenshot-decoding
 * the piano-roll overlay's paint for this claim: correctness of *what* was
 * transcribed is a data claim, not a paint claim (kb/verification.md,
 * "choosing a verification" — prefer the earliest level that can actually
 * falsify the claim). Milestones 4-6 add paint-level (screenshot-decoded
 * pixel) assertions for sparkle/pulse rendering on top of this same path.
 */

// SHORT_AUDIO is a 0.5s 440 Hz sine wave — MIDI 69 (A4), no other pitch.
const EXPECTED_MIDI_NOTE = 69;
const EXPECTED_START_TIME_MAX_S = 0.1;
const EXPECTED_END_TIME_MIN_S = 0.4;

// Real transcription can take up to ~11s (kb/verification.md); give the
// test itself headroom beyond the poll's own timeout for setup/teardown.
const TEST_TIMEOUT_MS = 45_000;

test.describe('Melody transcription path', () => {
  test('a known note is present at a known time after uploading a pure tone', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    const trackId = await getFirstTrackId(page);
    const melody = await waitForMelody(page, trackId);

    expect(melody.notes).toHaveLength(1);
    const [note] = melody.notes;
    expect(note.midiNote).toBe(EXPECTED_MIDI_NOTE);
    expect(note.startTime).toBeLessThan(EXPECTED_START_TIME_MAX_S);
    expect(note.endTime).toBeGreaterThan(EXPECTED_END_TIME_MIN_S);
    expect(note.confidence).toBeGreaterThan(0);
  });
});

/**
 * Sparkle bursts at the playhead line (mawimbi#484, spec 003 milestone 5).
 *
 * Reuses the exact production geometry math (`computeMeterRect`,
 * `computeBarCenterX`, `midiNoteToBin`, `computeNumberBins`) to derive the
 * expected on-screen x for the fixture's known note, rather than duplicating
 * or approximating that formula — the same "reuse the real math for
 * expectations" pattern `runway-geometry.spec.ts` uses for its width-anchor
 * invariant. `window.__mawimbi.sampleRate` (added for this milestone) avoids
 * assuming which sample rate this e2e environment's AudioContext actually
 * uses.
 *
 * A generic saturation check (`hasSaturatedPixel`) is not enough here — the
 * meter's background is translucent, so a track's own (randomized, #21/#36)
 * spectrogram color bleeds through it and would itself register as
 * "saturated" regardless of any sparkle. `Math.random` is pinned so the
 * track color is deterministic (teal, `COLOR_PALETTE[0]`), and
 * `hasWarmAccentPixelInColumns` checks hue specifically (red channel
 * dominant), which every palette color fails. Geometry is resolved before
 * starting playback and both x-bands are read from a single decoded
 * screenshot, so the "note" and "silent" checks are never at risk of
 * comparing two different real-world instants (the burst's own
 * `MAX_AGE_SECONDS` window is short, ~0.35s).
 */
test.describe('Sparkle bursts', () => {
  // A band well away from the note's own bar (near the low end of the
  // register) — proves the burst is positioned at the note's frequency,
  // not just "somewhere in the meter" (kb/verification.md: assert
  // invariants, not just presence).
  const SILENT_BAR_FRACTION = 0.1;
  const CLIP_HALF_WIDTH_PX = 20;

  // How far into the note's burst (age, in seconds) the screenshot targets.
  // Small — this environment's rAF loop runs irregularly under load, and a
  // late target risks landing after the burst's own ~0.35s max age or the
  // note's end.
  const BURST_AGE_TARGET_S = 0.05;
  const ENGINE_TIME_POLL_TIMEOUT_MS = 5_000;

  test('a sparkle-colored pixel appears at the active note bar position, and not away from it', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    // Pin track color so it can't coincidentally resemble the sparkle hue
    // (kb/verification.md: pin Math.random before any color assertion).
    await page.addInitScript(() => {
      Math.random = () => 0;
    });

    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    const trackId = await getFirstTrackId(page);
    const melody = await waitForMelody(page, trackId);
    const [note] = melody.notes;

    // Resolved before playback starts, so the only await between "engine
    // time reaches the target" and "screenshot taken" below is the
    // screenshot itself.
    const sampleRate = await page.evaluate(() => window.__mawimbi?.sampleRate);
    if (!sampleRate) {
      throw new Error('window.__mawimbi.sampleRate is unavailable');
    }
    const box = await page.locator('.scrubber__playhead').evaluate((el) => {
      const domRect = el.getBoundingClientRect();
      return {
        left: domRect.left,
        top: domRect.top,
        width: domRect.width,
        height: domRect.height,
      };
    });
    const rect = computeMeterRect(
      box.width,
      box.height,
      activeRunwayConfig.playheadWidth,
    );
    const barCount = Math.floor(computeNumberBins(sampleRate) / 2);
    const noteBarIndex = midiNoteToBin(note.midiNote) / 2;
    const noteLocalX = computeBarCenterX(rect, barCount, noteBarIndex);
    const silentLocalX = computeBarCenterX(
      rect,
      barCount,
      barCount * SILENT_BAR_FRACTION,
    );
    const boxClip = {
      x: box.left,
      y: box.top + rect.y,
      width: box.width,
      height: rect.height,
    };

    await page.getByTitle('Play').click();

    const targetEngineTime = note.startTime + BURST_AGE_TARGET_S;
    await expect
      .poll(
        async () =>
          page.evaluate(() => window.__mawimbi?.playback.getEngineTime()),
        { timeout: ENGINE_TIME_POLL_TIMEOUT_MS, intervals: [5] },
      )
      .toBeGreaterThanOrEqual(targetEngineTime);

    const decoded = await decodeClip(page, boxClip);

    expect(
      hasWarmAccentPixelInColumns(
        decoded,
        noteLocalX - CLIP_HALF_WIDTH_PX,
        noteLocalX + CLIP_HALF_WIDTH_PX,
      ),
      'no sparkle-colored pixel found at the active note bar position',
    ).toBe(true);
    expect(
      hasWarmAccentPixelInColumns(
        decoded,
        silentLocalX - CLIP_HALF_WIDTH_PX,
        silentLocalX + CLIP_HALF_WIDTH_PX,
      ),
      'unexpected sparkle-colored pixel found away from the active note',
    ).toBe(false);
  });
});
