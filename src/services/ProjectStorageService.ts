import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { type Track } from '../types/track';

const DB_NAME = 'mawimbi-db';
const DB_VERSION = 1;

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
}

let dbPromise: Promise<IDBPDatabase<MawimbiDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MawimbiDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MawimbiDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const projectStore = db.createObjectStore('projects', {
          keyPath: 'id',
        });
        projectStore.createIndex('by-updatedAt', 'updatedAt');

        db.createObjectStore('audioData', { keyPath: 'trackId' });
        db.createObjectStore('spectrograms', { keyPath: 'trackId' });
      },
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
    const tx = db.transaction(
      ['projects', 'audioData', 'spectrograms'],
      'readwrite',
    );
    tx.objectStore('projects').delete(id);
    for (const trackId of trackIds) {
      tx.objectStore('audioData').delete(trackId);
      tx.objectStore('spectrograms').delete(trackId);
    }
    await tx.done;
  }
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

export async function getStorageEstimate(): Promise<StorageEstimate> {
  if (navigator.storage?.estimate) {
    return navigator.storage.estimate();
  }
  return { usage: undefined, quota: undefined };
}

export function resetDB(): void {
  dbPromise = null;
}
