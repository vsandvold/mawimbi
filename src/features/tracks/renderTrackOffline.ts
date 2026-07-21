// Post-effect offline render — spec 004 M6 (#494). Rebuilds the track's
// Player → EffectsChain segment in a fresh Tone.Offline context (Tone
// nodes can't cross contexts, kb/domain.md's context-registry gotcha) and
// renders it at the track's *original* duration — tails beyond that are
// still audible live but visually truncated (spec non-goal) — so the CQT
// pipeline can re-analyse what the post-effect audio actually sounds like.
import * as Tone from 'tone';
import {
  ECHO_DELAY_SECONDS,
  MIN_EFFECT_AMOUNT,
  SPACE_DECAY_SECONDS,
  mapEchoAmount,
  mapSpaceAmount,
  mapToneAmount,
  type EffectAmounts,
} from './EffectsChain';

export default async function renderTrackOffline(
  audioBuffer: AudioBuffer,
  amounts: EffectAmounts,
): Promise<AudioBuffer> {
  const rendered = await Tone.Offline(async () => {
    const buffer = new Tone.ToneAudioBuffer(audioBuffer);
    const player = new Tone.Player(buffer);
    const nodes: Tone.ToneAudioNode[] = [];

    if (amounts.space > MIN_EFFECT_AMOUNT) {
      const reverb = new Tone.Reverb({
        decay: SPACE_DECAY_SECONDS,
        wet: mapSpaceAmount(amounts.space).wet,
      });
      // The impulse response generates asynchronously — skipping this
      // await silently omits the reverb's contribution instead of failing
      // (verified against real Tone 15.1.22, kb/verification.md, #489).
      await reverb.ready;
      nodes.push(reverb);
    }
    if (amounts.echo > MIN_EFFECT_AMOUNT) {
      const { wet, feedback } = mapEchoAmount(amounts.echo);
      nodes.push(
        new Tone.FeedbackDelay({
          delayTime: ECHO_DELAY_SECONDS,
          feedback,
          wet,
        }),
      );
    }
    if (amounts.tone > MIN_EFFECT_AMOUNT) {
      nodes.push(
        new Tone.Filter({
          frequency: mapToneAmount(amounts.tone).cutoffHz,
          type: 'lowpass',
        }),
      );
    }

    player.chain(...nodes, Tone.getDestination());
    player.start(0);
  }, audioBuffer.duration);

  return rendered.get()!;
}
