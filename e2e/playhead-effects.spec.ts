import { expect, test, uploadAudioFile, SHORT_AUDIO } from './fixtures';
import { getFirstTrackId, waitForMelody } from './helpers/mawimbiBridge';

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
