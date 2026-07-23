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

async function buildEffectsChain(
  amounts: EffectAmounts,
): Promise<Tone.ToneAudioNode[]> {
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

  return nodes;
}

export default async function renderTrackOffline(
  audioBuffer: AudioBuffer,
  amounts: EffectAmounts,
): Promise<AudioBuffer> {
  const rendered = await Tone.Offline(async () => {
    const buffer = new Tone.ToneAudioBuffer(audioBuffer);
    const player = new Tone.Player(buffer);
    const nodes = await buildEffectsChain(amounts);

    player.chain(...nodes, Tone.getDestination());
    player.start(0);
  }, audioBuffer.duration);

  return rendered.get()!;
}

// A capped window of the track's audio, rendered post-effect for the live
// effects preview (spec 006 M6, mawimbi#543) — sibling of the full-track
// `renderTrackOffline` above, sharing the same effects-chain construction.
// `plan.renderStartSeconds`/`renderDurationSeconds` include
// `plan.prerollSeconds` of lead-in so reverb/delay state is warmed by real
// preceding audio before the window that's actually shown; the preroll is
// trimmed from the rendered output before it's returned, so the caller
// (and the CQT analysis after it) only ever sees the output window.
export async function renderTrackOfflineWindow(
  audioBuffer: AudioBuffer,
  amounts: EffectAmounts,
  plan: {
    renderStartSeconds: number;
    renderDurationSeconds: number;
    prerollSeconds: number;
  },
): Promise<AudioBuffer> {
  const rendered = await Tone.Offline(async () => {
    const buffer = new Tone.ToneAudioBuffer(audioBuffer);
    const player = new Tone.Player(buffer);
    const nodes = await buildEffectsChain(amounts);

    player.chain(...nodes, Tone.getDestination());
    player.start(0, plan.renderStartSeconds);
  }, plan.renderDurationSeconds);

  return trimAudioBufferStart(rendered.get()!, plan.prerollSeconds);
}

function trimAudioBufferStart(
  buffer: AudioBuffer,
  trimSeconds: number,
): AudioBuffer {
  if (trimSeconds <= 0) return buffer;

  const trimSamples = Math.min(
    buffer.length,
    Math.round(trimSeconds * buffer.sampleRate),
  );
  const length = buffer.length - trimSamples;
  const trimmed = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length,
    sampleRate: buffer.sampleRate,
  });

  const channelData = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    buffer.copyFromChannel(channelData, channel, trimSamples);
    trimmed.copyToChannel(channelData, channel);
  }
  return trimmed;
}
