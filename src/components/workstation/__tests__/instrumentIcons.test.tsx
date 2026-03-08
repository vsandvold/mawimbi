import { render } from '@testing-library/react';

import { getInstrumentIcon } from '../instrumentIcons';
import type { InstrumentLabel } from '../../../services/InstrumentClassificationService';

const ALL_LABELS: InstrumentLabel[] = [
  'vocals',
  'guitar',
  'bass',
  'drums',
  'keyboard',
  'strings',
  'brass',
  'woodwind',
  'synth',
  'percussion',
  'unknown',
];

it.each(ALL_LABELS)('returns an icon for "%s"', (label) => {
  const icon = getInstrumentIcon(label);

  const { container } = render(<>{icon}</>);

  expect(container.querySelector('.custom-icon')).toBeInTheDocument();
});

it('returns fallback icon for undefined label', () => {
  const icon = getInstrumentIcon(undefined);

  const { container } = render(<>{icon}</>);

  expect(container.querySelector('.custom-icon')).toBeInTheDocument();
});

it('returns fallback icon for unknown label', () => {
  const icon = getInstrumentIcon('theremin');

  const { container } = render(<>{icon}</>);

  expect(container.querySelector('.custom-icon')).toBeInTheDocument();
});

it('returns different icons for different labels', () => {
  const vocalsIcon = getInstrumentIcon('vocals');
  const drumsIcon = getInstrumentIcon('drums');

  const { container: vocalsContainer } = render(<>{vocalsIcon}</>);
  const { container: drumsContainer } = render(<>{drumsIcon}</>);

  const vocalsSvg = vocalsContainer.querySelector('svg')?.innerHTML;
  const drumsSvg = drumsContainer.querySelector('svg')?.innerHTML;

  expect(vocalsSvg).not.toBe(drumsSvg);
});
