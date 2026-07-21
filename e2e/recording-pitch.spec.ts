import { expect, test } from './fixtures';
import { installFakeMicStream } from './helpers/fakeMicStream';
import {
  installAudioContextSpy,
  ensureAudioContextRunning,
  recordAudio,
} from './helpers/recording';
import { getFirstTrackId, waitForMelody } from './helpers/mawimbiBridge';

/**
 * Proves the full shipped recording pipeline end-to-end — capture →
 * latency trim → track creation → Basic Pitch transcription (spec 005
 * Goal 1, mawimbi#522) — using a controllable synthetic microphone
 * (`fakeMicStream.ts`) instead of Chrome's fake-device beep, which has no
 * contractually known frequency and so can't prove *what* was captured.
 *
 * Reads the transcribed melody through the dev-only `window.__mawimbi`
 * bridge (kb/decisions.md, 2026-07-20) — a data claim ("did the recorded
 * 440 Hz tone transcribe to MIDI 69") is better proven by a direct state
 * read than by screenshot-decoding the piano-roll overlay's paint
 * (kb/verification.md).
 */

// Same reuse rationale as the mawimbiBridge.ts melody poll (kb/verification.md,
// #480): a real Basic Pitch pass is measured, not instant.
const TEST_TIMEOUT_MS = 45_000;
const RECORDING_DURATION_MS = 3000;

// 440 Hz (the fake mic's default frequency) is MIDI 69 (A4).
const EXPECTED_MIDI_NOTE = 69;

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
  permissions: ['microphone'],
});

test.describe('Recording pitch proof', () => {
  test('recording from a 440 Hz fake mic transcribes to MIDI 69', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    await installFakeMicStream(page);
    await installAudioContextSpy(page);
    await page.goto('/project/test-id');
    await ensureAudioContextRunning(page);

    await recordAudio(page, { durationMs: RECORDING_DURATION_MS });

    const trackId = await getFirstTrackId(page);
    const melody = await waitForMelody(page, trackId);

    expect(
      melody.notes.some((note) => note.midiNote === EXPECTED_MIDI_NOTE),
      `expected a MIDI ${EXPECTED_MIDI_NOTE} note among transcribed notes: ${JSON.stringify(melody.notes)}`,
    ).toBe(true);
  });
});
