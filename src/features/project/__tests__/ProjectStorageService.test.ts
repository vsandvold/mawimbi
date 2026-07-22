import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
  deleteTrackData,
  saveAudioData,
  loadAudioData,
  deleteAudioData,
  saveSpectrogramData,
  loadSpectrogramData,
  deleteSpectrogramData,
  saveMelodyData,
  loadMelodyData,
  deleteMelodyData,
  saveTranscription,
  loadTranscription,
  deleteTranscription,
  getStorageEstimate,
  resetDB,
  type StoredProject,
  type SpectrogramStoreData,
  type MelodyStoreData,
  type TranscriptionStoreData,
} from '../ProjectStorageService';

function createProject(overrides: Partial<StoredProject> = {}): StoredProject {
  return {
    id: 'project-1',
    title: 'Test Project',
    tracks: [],
    nextColorId: 0,
    nextIndex: 0,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function createSpectrogramData(trackId: string): SpectrogramStoreData {
  return {
    trackId,
    frequencyFrames: [new ArrayBuffer(16), new ArrayBuffer(16)],
    timeResolution: 512,
    frequencyBinCount: 128,
    sampleRate: 44100,
    duration: 2.5,
  };
}

function createMelodyData(trackId: string): MelodyStoreData {
  return {
    trackId,
    notes: [
      { startTime: 0.1, endTime: 0.5, midiNote: 60, confidence: 0.9 },
      { startTime: 0.6, endTime: 1.0, midiNote: 64, confidence: 0.85 },
    ],
    timeResolution: 0.0029,
  };
}

function createTranscriptionData(trackId: string): TranscriptionStoreData {
  return {
    trackId,
    language: 'en',
    segments: [
      {
        text: 'Hello world',
        start: 0.0,
        end: 1.5,
        words: [
          { text: 'Hello', start: 0.0, end: 0.7 },
          { text: 'world', start: 0.8, end: 1.5 },
        ],
      },
    ],
  };
}

beforeEach(() => {
  // Fresh IndexedDB for each test
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
  });
  resetDB();
});

describe('ProjectStorageService', () => {
  describe('project CRUD', () => {
    it('saves and loads a project', async () => {
      const project = createProject();
      await saveProject(project);

      const loaded = await loadProject('project-1');
      expect(loaded).toEqual(project);
    });

    it('returns null for non-existent project', async () => {
      const loaded = await loadProject('does-not-exist');
      expect(loaded).toBeNull();
    });

    it('updates an existing project on save', async () => {
      await saveProject(createProject());
      await saveProject(createProject({ title: 'Updated', updatedAt: 2000 }));

      const loaded = await loadProject('project-1');
      expect(loaded?.title).toBe('Updated');
      expect(loaded?.updatedAt).toBe(2000);
    });

    it('lists projects sorted by updatedAt descending', async () => {
      await saveProject(createProject({ id: 'a', updatedAt: 100 }));
      await saveProject(createProject({ id: 'b', updatedAt: 300 }));
      await saveProject(createProject({ id: 'c', updatedAt: 200 }));

      const projects = await listProjects();
      expect(projects.map((p) => p.id)).toEqual(['b', 'c', 'a']);
    });

    it('returns empty array when no projects exist', async () => {
      const projects = await listProjects();
      expect(projects).toEqual([]);
    });

    it('deletes a project', async () => {
      await saveProject(createProject());
      await deleteProject('project-1');

      const loaded = await loadProject('project-1');
      expect(loaded).toBeNull();
    });

    it('deleting a non-existent project does not throw', async () => {
      await expect(deleteProject('does-not-exist')).resolves.toBeUndefined();
    });

    it('saves and loads project with tracks', async () => {
      const project = createProject({
        tracks: [
          {
            trackId: 'track-1',
            color: { r: 77, g: 238, b: 234 },
            fileName: 'drums.wav',
            index: 0,
          },
        ],
        nextColorId: 1,
        nextIndex: 1,
      });
      await saveProject(project);

      const loaded = await loadProject('project-1');
      expect(loaded?.tracks).toHaveLength(1);
      expect(loaded?.tracks[0].fileName).toBe('drums.wav');
    });
  });

  describe('deleteProject cleans up related data', () => {
    it('deletes associated audio, spectrogram, melody, and transcription data', async () => {
      const project = createProject({
        tracks: [
          {
            trackId: 'track-1',
            color: { r: 77, g: 238, b: 234 },
            fileName: 'drums.wav',
            index: 0,
          },
          {
            trackId: 'track-2',
            color: { r: 116, g: 238, b: 21 },
            fileName: 'bass.wav',
            index: 1,
          },
        ],
      });
      await saveProject(project);
      await saveAudioData('track-1', new ArrayBuffer(100));
      await saveAudioData('track-2', new ArrayBuffer(200));
      await saveSpectrogramData(createSpectrogramData('track-1'));
      await saveSpectrogramData(createSpectrogramData('track-2'));
      await saveMelodyData(createMelodyData('track-1'));
      await saveMelodyData(createMelodyData('track-2'));
      await saveTranscription(createTranscriptionData('track-1'));
      await saveTranscription(createTranscriptionData('track-2'));

      await deleteProject('project-1');

      expect(await loadAudioData('track-1')).toBeNull();
      expect(await loadAudioData('track-2')).toBeNull();
      expect(await loadSpectrogramData('track-1')).toBeNull();
      expect(await loadSpectrogramData('track-2')).toBeNull();
      expect(await loadMelodyData('track-1')).toBeNull();
      expect(await loadMelodyData('track-2')).toBeNull();
      expect(await loadTranscription('track-1')).toBeNull();
      expect(await loadTranscription('track-2')).toBeNull();
    });
  });

  // Code review finding (mawimbi#540 follow-up): `deleteTrackData` and
  // `deleteProject`'s per-track loop now share the same `TRACK_DATA_STORES`
  // list instead of each hand-maintaining its own — this is the single-
  // track counterpart used by `useDeleteTrackAudio`.
  describe('deleteTrackData', () => {
    it('deletes audio, spectrogram, melody, and transcription data for one track', async () => {
      await saveAudioData('track-1', new ArrayBuffer(100));
      await saveSpectrogramData(createSpectrogramData('track-1'));
      await saveMelodyData(createMelodyData('track-1'));
      await saveTranscription(createTranscriptionData('track-1'));

      await deleteTrackData('track-1');

      expect(await loadAudioData('track-1')).toBeNull();
      expect(await loadSpectrogramData('track-1')).toBeNull();
      expect(await loadMelodyData('track-1')).toBeNull();
      expect(await loadTranscription('track-1')).toBeNull();
    });

    it('does not affect other tracks', async () => {
      await saveAudioData('track-1', new ArrayBuffer(100));
      await saveAudioData('track-2', new ArrayBuffer(200));
      await saveSpectrogramData(createSpectrogramData('track-1'));
      await saveSpectrogramData(createSpectrogramData('track-2'));

      await deleteTrackData('track-1');

      expect(await loadAudioData('track-1')).toBeNull();
      expect(await loadSpectrogramData('track-1')).toBeNull();
      expect(await loadAudioData('track-2')).not.toBeNull();
      expect(await loadSpectrogramData('track-2')).not.toBeNull();
    });

    it('deleting an unknown track does not throw', async () => {
      await expect(deleteTrackData('does-not-exist')).resolves.toBeUndefined();
    });
  });

  describe('audio data CRUD', () => {
    it('saves and loads audio data', async () => {
      const buffer = new ArrayBuffer(1024);
      new Uint8Array(buffer).fill(42);

      await saveAudioData('track-1', buffer);
      const loaded = await loadAudioData('track-1');

      expect(loaded!.byteLength).toBe(1024);
      expect(new Uint8Array(loaded!)[0]).toBe(42);
    });

    it('returns null for non-existent audio data', async () => {
      const loaded = await loadAudioData('does-not-exist');
      expect(loaded).toBeNull();
    });

    it('overwrites existing audio data', async () => {
      await saveAudioData('track-1', new ArrayBuffer(100));
      await saveAudioData('track-1', new ArrayBuffer(200));

      const loaded = await loadAudioData('track-1');
      expect(loaded!.byteLength).toBe(200);
    });

    it('deletes audio data', async () => {
      await saveAudioData('track-1', new ArrayBuffer(100));
      await deleteAudioData('track-1');

      const loaded = await loadAudioData('track-1');
      expect(loaded).toBeNull();
    });

    it('deleting non-existent audio data does not throw', async () => {
      await expect(deleteAudioData('does-not-exist')).resolves.toBeUndefined();
    });
  });

  describe('spectrogram data CRUD', () => {
    it('saves and loads spectrogram data', async () => {
      const data = createSpectrogramData('track-1');
      await saveSpectrogramData(data);

      const loaded = await loadSpectrogramData('track-1');
      expect(loaded?.trackId).toBe('track-1');
      expect(loaded?.timeResolution).toBe(512);
      expect(loaded?.frequencyBinCount).toBe(128);
      expect(loaded?.sampleRate).toBe(44100);
      expect(loaded?.duration).toBe(2.5);
      expect(loaded?.frequencyFrames).toHaveLength(2);
    });

    it('returns null for non-existent spectrogram data', async () => {
      const loaded = await loadSpectrogramData('does-not-exist');
      expect(loaded).toBeNull();
    });

    it('overwrites existing spectrogram data', async () => {
      await saveSpectrogramData(createSpectrogramData('track-1'));
      const updated = createSpectrogramData('track-1');
      updated.duration = 5.0;
      await saveSpectrogramData(updated);

      const loaded = await loadSpectrogramData('track-1');
      expect(loaded?.duration).toBe(5.0);
    });

    it('deletes spectrogram data', async () => {
      await saveSpectrogramData(createSpectrogramData('track-1'));
      await deleteSpectrogramData('track-1');

      const loaded = await loadSpectrogramData('track-1');
      expect(loaded).toBeNull();
    });

    it('deleting non-existent spectrogram data does not throw', async () => {
      await expect(
        deleteSpectrogramData('does-not-exist'),
      ).resolves.toBeUndefined();
    });
  });

  describe('melody data CRUD', () => {
    it('saves and loads melody data', async () => {
      const data = createMelodyData('track-1');
      await saveMelodyData(data);

      const loaded = await loadMelodyData('track-1');
      expect(loaded?.trackId).toBe('track-1');
      expect(loaded?.timeResolution).toBe(0.0029);
      expect(loaded?.notes).toHaveLength(2);
      expect(loaded?.notes[0]).toEqual({
        startTime: 0.1,
        endTime: 0.5,
        midiNote: 60,
        confidence: 0.9,
      });
    });

    it('returns null for non-existent melody data', async () => {
      const loaded = await loadMelodyData('does-not-exist');
      expect(loaded).toBeNull();
    });

    it('overwrites existing melody data', async () => {
      await saveMelodyData(createMelodyData('track-1'));
      const updated = createMelodyData('track-1');
      updated.timeResolution = 0.005;
      await saveMelodyData(updated);

      const loaded = await loadMelodyData('track-1');
      expect(loaded?.timeResolution).toBe(0.005);
    });

    it('deletes melody data', async () => {
      await saveMelodyData(createMelodyData('track-1'));
      await deleteMelodyData('track-1');

      const loaded = await loadMelodyData('track-1');
      expect(loaded).toBeNull();
    });

    it('deleting non-existent melody data does not throw', async () => {
      await expect(deleteMelodyData('does-not-exist')).resolves.toBeUndefined();
    });
  });

  describe('transcription data CRUD', () => {
    it('saves and loads transcription data', async () => {
      const data = createTranscriptionData('track-1');
      await saveTranscription(data);

      const loaded = await loadTranscription('track-1');
      expect(loaded?.trackId).toBe('track-1');
      expect(loaded?.language).toBe('en');
      expect(loaded?.segments).toHaveLength(1);
      expect(loaded?.segments[0].text).toBe('Hello world');
      expect(loaded?.segments[0].words).toHaveLength(2);
      expect(loaded?.segments[0].words[0]).toEqual({
        text: 'Hello',
        start: 0.0,
        end: 0.7,
      });
    });

    it('returns null for non-existent transcription data', async () => {
      const loaded = await loadTranscription('does-not-exist');
      expect(loaded).toBeNull();
    });

    it('overwrites existing transcription data', async () => {
      await saveTranscription(createTranscriptionData('track-1'));
      const updated = createTranscriptionData('track-1');
      updated.language = 'fr';
      await saveTranscription(updated);

      const loaded = await loadTranscription('track-1');
      expect(loaded?.language).toBe('fr');
    });

    it('deletes transcription data', async () => {
      await saveTranscription(createTranscriptionData('track-1'));
      await deleteTranscription('track-1');

      const loaded = await loadTranscription('track-1');
      expect(loaded).toBeNull();
    });

    it('deleting non-existent transcription data does not throw', async () => {
      await expect(
        deleteTranscription('does-not-exist'),
      ).resolves.toBeUndefined();
    });
  });

  describe('getStorageEstimate', () => {
    it('returns storage estimate from navigator API', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: vi.fn().mockResolvedValue({ usage: 1024, quota: 1048576 }),
        },
        configurable: true,
      });

      const estimate = await getStorageEstimate();
      expect(estimate.usage).toBe(1024);
      expect(estimate.quota).toBe(1048576);
    });

    it('returns undefined values when storage API is unavailable', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: undefined,
        configurable: true,
      });

      const estimate = await getStorageEstimate();
      expect(estimate.usage).toBeUndefined();
      expect(estimate.quota).toBeUndefined();
    });
  });
});
