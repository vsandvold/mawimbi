import { useEffect, useRef, useState } from 'react';
import useLogService from '../hooks/useLogService';
import type { LogLevel } from '../services/LogService';
import './LogOverlay.css';

const LEVEL_LABELS: Record<LogLevel, string> = {
  log: 'LOG',
  warn: 'WRN',
  error: 'ERR',
  debug: 'DBG',
};

const LogOverlay = () => {
  const { entries, clear } = useLogService();
  const [isOpen, setIsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, isOpen]);

  const badge = entries.length > 0 ? ` (${entries.length})` : '';

  if (!isOpen) {
    return (
      <button className="log-overlay-toggle" onClick={() => setIsOpen(true)}>
        Logs{badge}
      </button>
    );
  }

  return (
    <div className="log-overlay">
      <div className="log-overlay-header">
        <span>Logs ({entries.length})</span>
        <div className="log-overlay-actions">
          <button onClick={clear}>Clear</button>
          <button onClick={() => setIsOpen(false)}>Close</button>
        </div>
      </div>
      <div className="log-overlay-list" ref={listRef}>
        {entries.map((entry) => (
          <div key={entry.id} className={`log-entry log-entry-${entry.level}`}>
            <span className="log-entry-level">{LEVEL_LABELS[entry.level]}</span>
            <span className="log-entry-time">
              {formatTime(entry.timestamp)}
            </span>
            <span className="log-entry-message">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

export default LogOverlay;
