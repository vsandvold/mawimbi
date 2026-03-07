import { useEffect, useRef } from 'react';
import useLogService from '../hooks/useLogService';
import type { LogLevel } from '../services/LogService';
import './LogOverlay.css';

const LEVEL_LABELS: Record<LogLevel, string> = {
  log: 'LOG',
  warn: 'WRN',
  error: 'ERR',
  debug: 'DBG',
};

type LogOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
};

const LogOverlay = (props: LogOverlayProps) => {
  const { isOpen, onClose } = props;
  const { entries, clear } = useLogService();
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="log-overlay">
      <div className="log-overlay-header">
        <span>Logs ({entries.length})</span>
        <div className="log-overlay-actions">
          <button onClick={clear}>Clear</button>
          <button onClick={onClose}>Close</button>
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
