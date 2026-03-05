import { describe, it, expect } from 'vitest';
import { pipeline, env } from '@huggingface/transformers';

describe('Transformers.js smoke test', () => {
  it('exports the pipeline function', () => {
    expect(typeof pipeline).toBe('function');
  });

  it('exports the env configuration object', () => {
    expect(env).toBeDefined();
    expect(typeof env).toBe('object');
  });

  it('env allows disabling remote models', () => {
    env.allowRemoteModels = false;
    expect(env.allowRemoteModels).toBe(false);
    env.allowRemoteModels = true;
  });
});
