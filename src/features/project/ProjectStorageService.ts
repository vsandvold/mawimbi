import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { type MelodyNote } from '../transcription/MelodyExtractor';
import { type Track } from '../tracks/types';
import { type TranscriptionSegment } from '../transcription/types';

const DB_NAME = 'mawimbi-db';
const DB_VERSION = 3;

// Every IndexedDB store keyed by trackId — the single source of truth for
// "what does a track own." `deleteProject` and `deleteTrackData` both build
// their per-track cleanup from this list instead of each hand-maintaining
// their own (mawimbi#540's IndexedDB orphan audit found these two lists had
// already drifted once: `deleteTrackData`'s single-track path was missing
// `melodies` while `deleteProject` already had it).
const TRACK_DATA_STORES = [
  'audioData',
  'spectrograms',
  'melodies',
  'transcriptions',
] as const;

export type StoredProject = {
  id: string;
  title: string;
  tracks: Track[];
  nextColorId: number;
  nextIndex: number;
  createdAt: number;
  updatedAt: number;
};

export type SpectrogramStoreData = {
  trackId: string;
  frequencyFrames: ArrayBuffer[];
  timeResolution: number;
  frequencyBinCount: number;
  sampleRate: number;
  duration: number;
  // Hash of the effect amounts this spectrogram was rendered from (spec 004
  // M6 `hashEffectAmounts`). A mismatch against the track's current effects
  // means the tiles are stale and need re-analysis. Absent on entries
  // rendered before spec 004 (dry data — an empty-amounts hash is a safe
  // stand-in, since M6 has not shipped a re-analysis workflow yet).
  effectsParamsHash?: string;
  // Frame count at analysis time (mawimbi#540, spec 006 M3). Absent on
  // entries persisted before this milestone — `fromSpectrogramStoreData`
  // falls back to deriving it from `duration`/`timeResolution` for those.
  totalFrames?: number;
};

export type MelodyStoreData = {
  trackId: string;
  notes: MelodyNote[];
  timeResolution: number;
};

export type TranscriptionStoreData = {
  trackId: string;
  language: string;
  segments: TranscriptionSegment[];
};

interface MawimbiDB extends DBSchema {
  projects: {
    key: string;
    value: StoredProject;
    indexes: { 'by-updatedAt': number };
  };
  audioData: {
    key: string;
    value: { trackId: string; data: ArrayBuffer };
  };
  spectrograms: {
    key: string;
    value: SpectrogramStoreData;
  };
  melodies: {
    key: string;
    value: MelodyStoreData;
  };
  transcriptions: {
    key: string;
    value: TranscriptionStoreData;
  };
}

let dbPromise: Promise<IDBPDatabase<MawimbiDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MawimbiDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MawimbiDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const projectStore = db.createObjectStore('projects', {
            keyPath: 'id',
          });
          projectStore.createIndex('by-updatedAt', 'updatedAt');

          db.createObjectStore('audioData', { keyPath: 'trackId' });
          db.createObjectStore('spectrograms', { keyPath: 'trackId' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('melodies', { keyPath: 'trackId' });
        }
        if (oldVersion < 3) {
          db.createObjectStore('transcriptions', { keyPath: 'trackId' });
        }
      },
      blocked() {
        // Version upgrade blocked by another tab holding an older connection.
        // The openDB promise will hang until that tab closes or refreshes.
        console.warn('Database upgrade blocked. Close other tabs to continue.');
      },
    }).catch((error) => {
      // Reset so the next call retries instead of returning this cached rejection
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

export async function saveProject(project: StoredProject): Promise<void> {
  const db = await getDB();
  await db.put('projects', project);
}

export async function loadProject(id: string): Promise<StoredProject | null> {
  const db = await getDB();
  const project = await db.get('projects', id);
  return project ?? null;
}

export async function listProjects(): Promise<StoredProject[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('projects', 'by-updatedAt');
  return all.reverse();
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  const project = await db.get('projects', id);
  if (project) {
    const trackIds = project.tracks.map((t) => t.trackId);
    const tx = db.transaction(['projects', ...TRACK_DATA_STORES], 'readwrite');
    tx.objectStore('projects').delete(id);
    for (const trackId of trackIds) {
      for (const store of TRACK_DATA_STORES) {
        tx.objectStore(store).delete(trackId);
      }
    }
    await tx.done;
  }
}

// Deletes every store a single track owns (audioData/spectrograms/melodies/
// transcriptions) in one transaction. The per-track counterpart to
// `deleteProject`'s cleanup, sharing the same `TRACK_DATA_STORES` list so
// the two can't drift the way they did before mawimbi#540 (single-track
// deletion — most commonly undoing an upload — was missing `melodies`).
export async function deleteTrackData(trackId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(TRACK_DATA_STORES, 'readwrite');
  for (const store of TRACK_DATA_STORES) {
    tx.objectStore(store).delete(trackId);
  }
  await tx.done;
}

export async function saveAudioData(
  trackId: string,
  data: ArrayBuffer,
): Promise<void> {
  const db = await getDB();
  await db.put('audioData', { trackId, data });
}

export async function loadAudioData(
  trackId: string,
): Promise<ArrayBuffer | null> {
  const db = await getDB();
  const entry = await db.get('audioData', trackId);
  return entry?.data ?? null;
}

export async function deleteAudioData(trackId: string): Promise<void> {
  const db = await getDB();
  await db.delete('audioData', trackId);
}

export async function saveSpectrogramData(
  data: SpectrogramStoreData,
): Promise<void> {
  const db = await getDB();
  await db.put('spectrograms', data);
}

export async function loadSpectrogramData(
  trackId: string,
): Promise<SpectrogramStoreData | null> {
  const db = await getDB();
  const entry = await db.get('spectrograms', trackId);
  return entry ?? null;
}

export async function deleteSpectrogramData(trackId: string): Promise<void> {
  const db = await getDB();
  await db.delete('spectrograms', trackId);
}

export async function saveMelodyData(data: MelodyStoreData): Promise<void> {
  const db = await getDB();
  await db.put('melodies', data);
}

export async function loadMelodyData(
  trackId: string,
): Promise<MelodyStoreData | null> {
  const db = await getDB();
  const entry = await db.get('melodies', trackId);
  return entry ?? null;
}

export async function deleteMelodyData(trackId: string): Promise<void> {
  const db = await getDB();
  await db.delete('melodies', trackId);
}

export async function saveTranscription(
  data: TranscriptionStoreData,
): Promise<void> {
  const db = await getDB();
  await db.put('transcriptions', data);
}

export async function loadTranscription(
  trackId: string,
): Promise<TranscriptionStoreData | null> {
  const db = await getDB();
  const entry = await db.get('transcriptions', trackId);
  return entry ?? null;
}

export async function deleteTranscription(trackId: string): Promise<void> {
  const db = await getDB();
  await db.delete('transcriptions', trackId);
}

export async function getStorageEstimate(): Promise<StorageEstimate> {
  if (navigator.storage?.estimate) {
    return navigator.storage.estimate();
  }
  return { usage: undefined, quota: undefined };
}

export function resetDB(): void {
  dbPromise = null;
}
