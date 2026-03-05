import { formatRelativeTime } from '../formatRelativeTime';

it('formats timestamps less than a minute ago', () => {
  expect(formatRelativeTime(Date.now() - 30_000)).toBe('just now');
});

it('formats timestamps in minutes', () => {
  expect(formatRelativeTime(Date.now() - 60_000)).toBe('1 minute ago');
  expect(formatRelativeTime(Date.now() - 300_000)).toBe('5 minutes ago');
});

it('formats timestamps in hours', () => {
  expect(formatRelativeTime(Date.now() - 3_600_000)).toBe('1 hour ago');
  expect(formatRelativeTime(Date.now() - 7_200_000)).toBe('2 hours ago');
});

it('formats timestamps in days', () => {
  expect(formatRelativeTime(Date.now() - 86_400_000)).toBe('1 day ago');
  expect(formatRelativeTime(Date.now() - 259_200_000)).toBe('3 days ago');
});
