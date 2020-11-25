import React, { useEffect, useRef } from 'react';
import { useAudioService } from '../../hooks/useAudioService';
import OfflineAnalyser from '../../services/OfflineAnalyser';
import { Track, TrackColor } from '../project/projectPageReducer';
import './Spectrogram.css';

type SpectrogramProps = {
  height: number;
  pixelsPerSecond: number;
  track: Track;
};

const Spectrogram = ({ height, pixelsPerSecond, track }: SpectrogramProps) => {
  const analyserRef = useRef<OfflineAnalyser>();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { trackId, color, volume } = track;

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
        heightFactor
      );
      const renderCallback = (
        frequencyData: Uint8Array,
        currentTime: number
      ) => {
        const x = Math.trunc(currentTime / timeResolution);
        canvasRenderer.drawSpectrogramFrame(frequencyData, x);
      };
      analyserRef.current.getLogarithmicFrequencyData(renderCallback);
    }
  }, [color, canvasHeight, heightFactor, timeResolution]);

  const containerWidth = canvasWidth * widthFactor;
  const containerHeight = canvasHeight * heightPixelRatio;

  const containerStyles = {
    opacity: convertToOpacity(volume),
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

function convertToOpacity(value: number): string {
  return (value / 100).toFixed(2);
}

class SpectrogramCanvasRenderer {
  private canvasContext: CanvasRenderingContext2D | null;
  private colorMap: number[][];
  private height: number;
  private heightFactor: number;

  constructor(
    canvas: HTMLCanvasElement,
    color: TrackColor,
    height: number,
    heightFactor: number
  ) {
    this.canvasContext = SpectrogramCanvasRenderer.createCanvasContext(canvas);
    this.colorMap = SpectrogramCanvasRenderer.createColorMap(color);
    this.height = height;
    this.heightFactor = heightFactor;
  }

  private static createCanvasContext(
    canvas: HTMLCanvasElement
  ): CanvasRenderingContext2D | null {
    const canvasContext = canvas.getContext('2d', {
      alpha: true,
      desynchronized: true,
    });
    if (canvasContext) {
      canvasContext.imageSmoothingEnabled = false;
    }
    return canvasContext;
  }

  private static createColorMap(color: TrackColor): number[][] {
    const { r, g, b } = color;
    const colorMap = [];
    for (let i = 0; i < 256; i++) {
      const opacity = i / 256;
      colorMap.push([r, g, b, opacity]);
    }
    return colorMap;
  }

  drawSpectrogramFrame(frequencyData: Uint8Array, x: number) {
    if (!this.canvasContext) {
      return;
    }
    for (let i = 0, binCount = frequencyData.length; i < binCount; i++) {
      const color = this.colorMap[frequencyData[i]];
      this.canvasContext.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
      this.canvasContext.fillRect(
        x,
        this.height - i * this.heightFactor,
        1,
        this.heightFactor
      );
    }
  }
}

export default Spectrogram;
