// Bridge hook: LogService signals → React components.
//
// Calls useSignals() to subscribe to LogService's entries signal,
// then returns plain values and action callbacks for components.

import { useSignals } from '@preact/signals-react/runtime';
import LogService, { type LogEntry } from './LogService';

type LogServiceHook = {
  entries: readonly LogEntry[];
  clear: () => void;
};

const useLogService = (): LogServiceHook => {
  useSignals();

  return {
    get entries() {
      return LogService.signals.entries.value;
    },
    clear: LogService.clear,
  };
};

export default useLogService;
