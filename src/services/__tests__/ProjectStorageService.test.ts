import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
  saveAudioData,
  loadAudioData,
  deleteAudioData,
  saveSpectrogramData,
  loadSpectrogramData,
  deleteSpectrogramData,
  getStorageEstimate,
  resetDB,
  type StoredProject,
  type SpectrogramStoreData,
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
    it('deletes associated audio and spectrogram data', async () => {
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

      await deleteProject('project-1');

      expect(await loadAudioData('track-1')).toBeNull();
      expect(await loadAudioData('track-2')).toBeNull();
      expect(await loadSpectrogramData('track-1')).toBeNull();
      expect(await loadSpectrogramData('track-2')).toBeNull();
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
