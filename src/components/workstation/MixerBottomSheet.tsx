import { type Track } from '../../types/track';
import BottomSheet from './BottomSheet';
import Mixer from './Mixer';

type MixerBottomSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onHeightChange: (height: number) => void;
  tracks: Track[];
};

const MixerBottomSheet = ({
  isOpen,
  onOpenChange,
  onHeightChange,
  tracks,
}: MixerBottomSheetProps) => (
  <BottomSheet
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    onHeightChange={onHeightChange}
    title="Mixer"
  >
    <Mixer tracks={tracks} />
  </BottomSheet>
);

export default MixerBottomSheet;
