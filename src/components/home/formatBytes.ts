const UNITS = ['B', 'KB', 'MB', 'GB'];
const STEP = 1024;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  let unitIndex = 0;
  let value = bytes;

  while (value >= STEP && unitIndex < UNITS.length - 1) {
    value /= STEP;
    unitIndex++;
  }

  const formatted = unitIndex === 0 ? value.toString() : value.toFixed(1);
  return `${formatted} ${UNITS[unitIndex]}`;
}
