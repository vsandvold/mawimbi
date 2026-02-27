// Match the OfflineAnalyser's AnalyserNode dB range for visual consistency
const MIN_DB = -80;
const MAX_DB = -30;
const DB_RANGE = MAX_DB - MIN_DB;

export function dbToByte(db: number): number {
  if (db <= MIN_DB) return 0;
  if (db >= MAX_DB) return 255;
  return Math.round(((db - MIN_DB) / DB_RANGE) * 255);
}
