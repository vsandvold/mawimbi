import { useEffect, useRef } from 'react';
import { useAudioService } from '../../hooks/useAudioService';
import { useTrackVolume } from '../../hooks/useTrackVolume';
import OfflineAnalyser from '../../services/OfflineAnalyser';
import SpectrogramCanvasRenderer from '../../services/SpectrogramCanvasRenderer';
import { Track } from '../project/projectPageReducer';
import './Spectrogram.css';

type SpectrogramProps = {
  height: number;
  pixelsPerSecond: number;
  track: Track;
};

const Spectrogram = ({ height, pixelsPerSecond, track }: SpectrogramProps) => {
  const analyserRef = useRef<OfflineAnalyser | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { trackId, color } = track;

  const audioService = useAudioService();
  const audioBuffer = audioService.retrieveAudioBuffer(trackId);

  if (audioBuffer && !analyserRef.current) {
    analyserRef.current = new OfflineAnalyser(audioBuffer);
  }
  const duration = audioBuffer?.duration ?? 0;
  const frequencyBinCount = analyserRef.current?.frequencyBinCount ?? 2048;
  const timeResolution = analyserRef.current?.timeResolution ?? 0.025;

  const heightPixelRatio = height / frequencyBinCount;
  const heightFactor = Math.ceil(heightPixelRatio);
  const widthFactor = Math.ceil(pixelsPerSecond * timeResolution);
  const canvasWidth = Math.trunc(duration / timeResolution);
  const canvasHeight = Math.ceil(heightPixelRatio) * frequencyBinCount;

  useEffect(() => {
    if (analyserRef.current && canvasRef.current) {
      const canvasRenderer = new SpectrogramCanvasRenderer(
        canvasRef.current,
        color,
        canvasHeight,
        heightFactor,
      );
      const renderCallback = (
        frequencyData: Uint8Array,
        currentTime: number,
      ) => {
        const x = Math.trunc(currentTime / timeResolution);
        canvasRenderer.drawSpectrogramFrame(frequencyData, x);
      };
      analyserRef.current.getLogarithmicFrequencyData(renderCallback);
    }
  }, [color, canvasHeight, heightFactor, timeResolution]);

  const containerWidth = canvasWidth * widthFactor;
  const containerHeight = canvasHeight * heightPixelRatio;

  const { opacity } = useTrackVolume(trackId);

  const containerStyles = {
    opacity,
    width: containerWidth,
  };

  return (
    <div className="spectrogram" style={containerStyles}>
      <canvas
        ref={canvasRef}
        className="spectrogram__canvas"
        width={canvasWidth}
        height={canvasHeight}
        style={{
          width: containerWidth,
          height: containerHeight,
        }}
      />
    </div>
  );
};

export default Spectrogram;
