// LogService — intercepts console.log/warn/error/debug and captures entries
// for display in the UI overlay.
//
// On install(), replaces native console methods with wrappers that:
// 1. Forward to the original console method (so devtools still work)
// 2. Append the message to the entries signal (so the UI overlay can show it)
//
// Callers throughout the app just use console.log/warn/error/debug as normal.
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

function clear(): void {
  _entries.value = [];
}

// --- Console interception ---

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

let installed = false;

function install(): void {
  if (installed) return;
  installed = true;

  const LEVELS: LogLevel[] = ['log', 'warn', 'error', 'debug'];
  for (const level of LEVELS) {
    console[level] = (...args: unknown[]) => {
      originalConsole[level](...args);
      append(level, args);
    };
  }
}

export default { signals, getEntries, clear, install };
