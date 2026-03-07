// LogService — captures log messages for display in the UI.
//
// Replaces console.log/warn/error calls throughout the app so that log
// output is visible on devices without devtools (e.g. mobile browsers).
//
// Signal ownership: LogService owns the `entries` signal. Only LogService
// writes to it. Consumers read via the `signals` accessor (bridge hooks)
// or the plain `entries` getter (tests, workflows).

import { signal, type ReadonlySignal } from '@preact/signals-react';

export type LogLevel = 'log' | 'warn' | 'error' | 'debug';

export type LogEntry = {
  id: number;
  level: LogLevel;
  message: string;
  timestamp: number;
};

const MAX_ENTRIES = 200;

let nextId = 0;

const _entries = signal<readonly LogEntry[]>([]);

// --- Narrow channel for reactive consumers (hooks) ---

const signals: {
  readonly entries: ReadonlySignal<readonly LogEntry[]>;
} = {
  entries: _entries,
};

// --- Plain getter for non-reactive consumers (tests, workflows) ---

function getEntries(): readonly LogEntry[] {
  return _entries.value;
}

// --- Mutation functions ---

function append(level: LogLevel, args: unknown[]): void {
  const message = args
    .map((arg) =>
      typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2),
    )
    .join(' ');

  const entry: LogEntry = {
    id: nextId++,
    level,
    message,
    timestamp: Date.now(),
  };

  const current = _entries.value;
  const updated =
    current.length >= MAX_ENTRIES
      ? [...current.slice(current.length - MAX_ENTRIES + 1), entry]
      : [...current, entry];
  _entries.value = updated;
}

function log(...args: unknown[]): void {
  append('log', args);
}

function warn(...args: unknown[]): void {
  append('warn', args);
}

function error(...args: unknown[]): void {
  append('error', args);
}

function debug(...args: unknown[]): void {
  append('debug', args);
}

function clear(): void {
  _entries.value = [];
}

export default { signals, getEntries, log, warn, error, debug, clear };
