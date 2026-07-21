import { render } from '@testing-library/react';
import { vi } from 'vitest';
import MicLevelMeter from '../MicLevelMeter';

vi.mock('../../recording/useRecordingService', () => ({
  useRecordingService: () => ({
    getLoudness: () => 0.5,
  }),
}));

it('renders a level bar', () => {
  const { getByTestId } = render(<MicLevelMeter active={false} />);

  expect(getByTestId('mic-level-meter')).toBeInTheDocument();
});

it('does not crash when active', () => {
  const { getByTestId, unmount } = render(<MicLevelMeter active={true} />);

  expect(getByTestId('mic-level-meter')).toBeInTheDocument();
  unmount();
});
