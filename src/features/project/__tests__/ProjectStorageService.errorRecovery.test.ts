import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

const { mockOpenDB } = vi.hoisted(() => ({
  mockOpenDB: vi.fn(),
}));

vi.mock('idb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('idb')>();
  return {
    ...actual,
    openDB: (...args: Parameters<typeof actual.openDB>) =>
      mockOpenDB(...args) ?? actual.openDB(...args),
  };
});

import { listProjects, resetDB } from '../ProjectStorageService';

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
  });
  resetDB();
  mockOpenDB.mockReset();
});

describe('ProjectStorageService error recovery', () => {
  it('retries after a failed DB open instead of caching the rejected promise', async () => {
    // First call: openDB returns a promise that rejects
    mockOpenDB.mockRejectedValueOnce(new Error('upgrade blocked'));

    await expect(listProjects()).rejects.toThrow('upgrade blocked');

    // Subsequent calls should retry with real openDB (mockOpenDB returns undefined → falls through)
    const projects = await listProjects();
    expect(projects).toEqual([]);
  });
});
