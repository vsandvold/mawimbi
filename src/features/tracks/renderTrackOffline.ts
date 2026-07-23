// Post-effect offline render — spec 004 M6 (#494). Rebuilds the track's
// Player → EffectsChain segment in a fresh offline context (Tone nodes
// can't cross contexts, kb/domain.md's context-registry gotcha) and renders
// it at the track's *original* duration — tails beyond that are still
// audible live but visually truncated (spec non-goal) — so the CQT
// pipeline can re-analyse what the post-effect audio actually sounds like.
//
// Builds the offline context manually (`new Tone.OfflineContext(...)` +
// explicit `context` on every node) instead of using `Tone.Offline()`.
// `Tone.Offline()` implements this by mutating the process-global "current
// context" (`Tone.setContext()`) for the duration of its callback, then
// restoring whatever was current *when that call started*
// (node_modules/tone/Tone/core/context/Offline.ts) — not a real stack. The
// live-effects-preview scheduler (effectsPreview.ts) fires a new offline
// render every ~150ms while a slider is dragged, and each render takes
// 1-5+ seconds (measured; see effectsPreview.ts's PREVIEW_THROTTLE_MS
// comment) — so overlapping Tone.Offline() calls are the norm for any drag
// longer than ~1s, not a rare edge case. Confirmed via a real-Tone.js repro
// (not the mocked test harness): when a later-started call's render
// finishes *after* an earlier one's, its restore overwrites the correct
// live context with the earlier call's already-rendered, defunct
// OfflineContext — permanently stranding the process-global context for
// the rest of the session. Everything that reads `Tone.getContext()`/
// `Tone.getDestination()`/`Tone.getTransport()` afterward (not just this
// module) then operates against a dead context instead of the real one.
// Building our own OfflineContext and threading it explicitly through
// every node sidesteps the global entirely — this code never reads or
// writes it.
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

const OFFLINE_RENDER_CHANNELS = 2;

async function buildEffectsChain(
  amounts: EffectAmounts,
  context: Tone.OfflineContext,
): Promise<Tone.ToneAudioNode[]> {
  const nodes: Tone.ToneAudioNode[] = [];

  if (amounts.space > MIN_EFFECT_AMOUNT) {
    const reverb = new Tone.Reverb({
      decay: SPACE_DECAY_SECONDS,
      wet: mapSpaceAmount(amounts.space).wet,
      context,
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
        context,
      }),
    );
  }
  if (amounts.tone > MIN_EFFECT_AMOUNT) {
    nodes.push(
      new Tone.Filter({
        frequency: mapToneAmount(amounts.tone).cutoffHz,
        type: 'lowpass',
        context,
      }),
    );
  }

  return nodes;
}

// Renders `audioBuffer` through the given effects chain on a fresh,
// self-contained offline context — never touches the process-global Tone
// context (see the module-level comment above for why that matters).
async function renderOnOfflineContext(
  audioBuffer: AudioBuffer,
  amounts: EffectAmounts,
  durationSeconds: number,
  startOffset: number,
): Promise<AudioBuffer> {
  const context = new Tone.OfflineContext(
    OFFLINE_RENDER_CHANNELS,
    durationSeconds,
    audioBuffer.sampleRate,
  );
  const buffer = new Tone.ToneAudioBuffer(audioBuffer);
  const player = new Tone.Player({ url: buffer, context });
  const nodes = await buildEffectsChain(amounts, context);

  player.chain(...nodes, context.destination);
  player.start(0, startOffset);

  const rendered = await context.render();
  return rendered.get()!;
}

export default async function renderTrackOffline(
  audioBuffer: AudioBuffer,
  amounts: EffectAmounts,
): Promise<AudioBuffer> {
  return renderOnOfflineContext(audioBuffer, amounts, audioBuffer.duration, 0);
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
  const rendered = await renderOnOfflineContext(
    audioBuffer,
    amounts,
    plan.renderDurationSeconds,
    plan.renderStartSeconds,
  );

  return trimAudioBufferStart(rendered, plan.prerollSeconds);
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
