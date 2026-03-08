import type { InstrumentLabel } from '../../services/instrumentLabels';

import BassSvg from '../../icons/bass.svg?react';
import BrassSvg from '../../icons/brass.svg?react';
import DrumsSvg from '../../icons/drums.svg?react';
import GuitarSvg from '../../icons/guitar.svg?react';
import KeyboardSvg from '../../icons/keyboard.svg?react';
import PercussionSvg from '../../icons/percussion.svg?react';
import StringsSvg from '../../icons/strings.svg?react';
import SynthSvg from '../../icons/synth.svg?react';
import UnknownSvg from '../../icons/unknown.svg?react';
import VocalsSvg from '../../icons/vocals.svg?react';
import WoodwindSvg from '../../icons/woodwind.svg?react';

const INSTRUMENT_ICONS: Record<InstrumentLabel, React.ComponentType> = {
  vocals: VocalsSvg,
  guitar: GuitarSvg,
  bass: BassSvg,
  drums: DrumsSvg,
  keyboard: KeyboardSvg,
  strings: StringsSvg,
  brass: BrassSvg,
  woodwind: WoodwindSvg,
  synth: SynthSvg,
  percussion: PercussionSvg,
  unknown: UnknownSvg,
};

export function getInstrumentIcon(label: string | undefined): React.ReactNode {
  const SvgComponent =
    label && label in INSTRUMENT_ICONS
      ? INSTRUMENT_ICONS[label as InstrumentLabel]
      : INSTRUMENT_ICONS.unknown;

  return (
    <span className="custom-icon">
      <SvgComponent />
    </span>
  );
}
