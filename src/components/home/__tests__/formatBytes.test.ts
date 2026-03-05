import { formatBytes } from '../formatBytes';

it('formats zero bytes', () => {
  expect(formatBytes(0)).toBe('0 B');
});

it('formats bytes', () => {
  expect(formatBytes(512)).toBe('512 B');
});

it('formats kilobytes', () => {
  expect(formatBytes(1024)).toBe('1.0 KB');
  expect(formatBytes(1536)).toBe('1.5 KB');
});

it('formats megabytes', () => {
  expect(formatBytes(1048576)).toBe('1.0 MB');
  expect(formatBytes(47185920)).toBe('45.0 MB');
});

it('formats gigabytes', () => {
  expect(formatBytes(1073741824)).toBe('1.0 GB');
  expect(formatBytes(2147483648)).toBe('2.0 GB');
});
