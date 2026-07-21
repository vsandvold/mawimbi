/**
 * Controllable synthetic microphone for e2e recording tests (mawimbi#522,
 * spec 005 Decision 4). Overrides `navigator.mediaDevices.getUserMedia` to
 * return an `OscillatorNode → MediaStreamAudioDestinationNode` stream at a
 * known frequency, replacing reliance on Chrome's
 * `--use-fake-device-for-media-stream` beep, which has no contractually
 * known frequency and so can only prove "a track was created", not "the
 * right audio was captured".
 *
 * Installed as a `page.addInitScript` so the override is in place before
 * `MicrophoneService.open()` ever calls `getUserMedia` (must run before
 * app scripts, same requirement as `installAudioContextSpy` in
 * `helpers/recording.ts`). `window.__setFakeMicFrequency(hz)` lets a test
 * change pitch mid-recording (e.g. proving a punch splice picked up a new
 * tone, spec 005 milestone 5).
 */
import type { Page } from '@playwright/test';

export const DEFAULT_FAKE_MIC_FREQUENCY_HZ = 440;

type FakeMicWindow = Window & {
  __setFakeMicFrequency?: (hz: number) => void;
};

export async function installFakeMicStream(
  page: Page,
  frequencyHz: number = DEFAULT_FAKE_MIC_FREQUENCY_HZ,
): Promise<void> {
  await page.addInitScript((initialFrequencyHz: number) => {
    const oscillators = new Set<OscillatorNode>();
    let currentFrequencyHz = initialFrequencyHz;

    (window as FakeMicWindow).__setFakeMicFrequency = (hz: number) => {
      currentFrequencyHz = hz;
      oscillators.forEach((oscillator) => {
        oscillator.frequency.setValueAtTime(
          hz,
          oscillator.context.currentTime,
        );
      });
    };

    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      oscillator.frequency.value = currentFrequencyHz;
      const destination = context.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      oscillators.add(oscillator);
      return destination.stream;
    };
  }, frequencyHz);
}
