import { getTimelineTrackClass } from '../Timeline';
import { type Track } from '../../tracks/types';

function makeTrack(trackId: string): Track {
  return {
    trackId,
    color: { r: 0, g: 0, b: 0 },
    fileName: 'test.wav',
    index: 0,
  };
}

const track = makeTrack('track-1');

describe('getTimelineTrackClass', () => {
  describe('default state', () => {
    it('is plain when nothing is focused, targeted, muted, or in edit mode', () => {
      const result = getTimelineTrackClass(track, [], [], null, null);

      expect(result).toBe('timeline__track');
    });
  });

  describe('focus (foreground/background)', () => {
    it('lifts the focused track', () => {
      const result = getTimelineTrackClass(track, [], ['track-1'], null, null);

      expect(result).toContain('timeline__track--foreground');
      expect(result).not.toContain('timeline__track--background');
    });

    it('dims a track when another one is focused', () => {
      const result = getTimelineTrackClass(track, [], ['track-2'], null, null);

      expect(result).toContain('timeline__track--background');
      expect(result).not.toContain('timeline__track--foreground');
    });
  });

  describe('drag target', () => {
    it('gets the intermediate tier when it is the live drag target', () => {
      const result = getTimelineTrackClass(
        track,
        [],
        ['track-2'],
        'track-1',
        null,
      );

      expect(result).toContain('timeline__track--drag-target');
      expect(result).not.toContain('timeline__track--background');
      expect(result).not.toContain('timeline__track--foreground');
    });

    it('foreground wins over drag-target for the same track', () => {
      // Shouldn't be reachable in practice (a track can't be both the
      // dragged track and its own over target), but the precedence must
      // still resolve to a single, well-defined tier if it ever is.
      const result = getTimelineTrackClass(
        track,
        [],
        ['track-1'],
        'track-1',
        null,
      );

      expect(result).toContain('timeline__track--foreground');
      expect(result).not.toContain('timeline__track--drag-target');
    });
  });

  describe('mute', () => {
    it('hides a muted track with no focus active', () => {
      const result = getTimelineTrackClass(track, ['track-1'], [], null, null);

      expect(result).toContain('timeline__track--muted');
    });

    it('lift wins over mute for the track being manipulated (foreground)', () => {
      const result = getTimelineTrackClass(
        track,
        ['track-1'],
        ['track-1'],
        null,
        null,
      );

      expect(result).toContain('timeline__track--foreground');
      expect(result).not.toContain('timeline__track--muted');
    });

    it('a muted track merely crossed by a drag stays hidden, not drag-target', () => {
      const result = getTimelineTrackClass(
        track,
        ['track-1'],
        ['track-2'],
        'track-1',
        null,
      );

      expect(result).toContain('timeline__track--muted');
      expect(result).not.toContain('timeline__track--drag-target');
    });

    it('a muted, unfocused track with no drag active stays hidden, not background', () => {
      const result = getTimelineTrackClass(
        track,
        ['track-1'],
        ['track-2'],
        null,
        null,
      );

      expect(result).toContain('timeline__track--muted');
      expect(result).not.toContain('timeline__track--background');
    });
  });

  describe('edit mode', () => {
    it('overrides focus, drag-target, and mute entirely', () => {
      const result = getTimelineTrackClass(
        track,
        ['track-1'],
        ['track-1'],
        'track-1',
        'track-1',
      );

      expect(result).toBe('timeline__track timeline__track--edit-active');
    });

    it('dims a non-active track in edit mode even when muted', () => {
      const result = getTimelineTrackClass(
        track,
        ['track-1'],
        [],
        null,
        'track-2',
      );

      expect(result).toBe('timeline__track timeline__track--edit-background');
    });
  });
});
