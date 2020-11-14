import React, { useEffect, useRef, useState } from 'react';
import OfflineAnalyser from '../../services/OfflineAnalyser';
import { Track, TrackColor } from '../project/projectPageReducer';
import './Spectrogram.css';

type SpectrogramProps = {
  height: number;
  pixelsPerSecond: number;
  track: Track;
};

const Spectrogram = ({ height, pixelsPerSecond, track }: SpectrogramProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const frequencyBinCountRef = useRef(0);
  const timeResolutionRef = useRef(0);

  const frequencyDataRef = useRef<Uint8Array>();
  const currentWidthOffsetRef = useRef(0);
  const previousWidthOffsetRef = useRef(0);

  const [isRendering, setIsRendering] = useState(false);

  const { audioBuffer, color, volume } = track;

  const heightPixelRatio = height / frequencyBinCountRef.current;
  const heightFactor = Math.ceil(heightPixelRatio);
  const widthFactor = Math.ceil(pixelsPerSecond * timeResolutionRef.current);
  const canvasWidth = Math.trunc(audioBuffer.duration * pixelsPerSecond);
  const canvasHeight =
    Math.ceil(heightPixelRatio) * frequencyBinCountRef.current;

  useEffect(() => {
    const offlineAnalyser = new OfflineAnalyser(audioBuffer);
    frequencyBinCountRef.current = offlineAnalyser.frequencyBinCount;
    timeResolutionRef.current = offlineAnalyser.timeResolution;

    setIsRendering(true);
    offlineAnalyser
      .getLogarithmicFrequencyData(
        (frequencyData: Uint8Array, currentTime: number) => {
          console.log('get frequency data');
          frequencyDataRef.current = frequencyData;
          currentWidthOffsetRef.current = Math.trunc(
            currentTime * pixelsPerSecond
          );
        }
      )
      .then(() => setIsRendering(false));
  }, [audioBuffer, pixelsPerSecond]);

  useEffect(() => {
    const colorMap = createColorMap(color);
    const canvasContext = canvasRef.current!.getContext('2d');

    function renderingCallback() {
      if (currentWidthOffsetRef.current !== previousWidthOffsetRef.current) {
        console.log('render frame');
        drawSpectrogramFrame(
          frequencyDataRef.current!,
          canvasHeight,
          colorMap,
          canvasContext as CanvasRenderingContext2D,
          heightFactor,
          widthFactor,
          currentWidthOffsetRef.current
        );
        previousWidthOffsetRef.current = currentWidthOffsetRef.current;
      }
      if (isRendering) {
        requestAnimationFrame(renderingCallback);
      }
    }
    if (isRendering) {
      requestAnimationFrame(renderingCallback);
      console.log('start rendering');
    }
  }, [canvasHeight, color, heightFactor, isRendering, widthFactor]);

  const wrapperStyle = {
    opacity: convertToOpacity(volume),
    transform: `scaleY(${heightPixelRatio})`,
    transformOrigin: 'top left',
    width: `${canvasWidth}px`,
  };

  return (
    <div className="spectrogram" style={wrapperStyle}>
      <canvas
        ref={canvasRef}
        className="spectrogram__canvas"
        width={canvasWidth}
        height={canvasHeight}
      />
    </div>
  );
};

function convertToOpacity(value: number): string {
  return (value / 100).toFixed(2);
}

function createColorMap(color: TrackColor): number[][] {
  const { r, g, b } = color;
  const colorMap = [];
  for (let i = 0; i < 256; i++) {
    const opacity = i / 256;
    colorMap.push([r, g, b, opacity]);
  }
  return colorMap;
}

function drawSpectrogramFrame(
  frequencyData: Uint8Array,
  height: number,
  colorMap: number[][],
  canvasContext: CanvasRenderingContext2D,
  heightFactor: number,
  widthFactor: number,
  x: number
) {
  for (let i = 0, binCount = frequencyData.length; i < binCount; i++) {
    const color = colorMap[frequencyData[i]];
    canvasContext.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
    canvasContext.fillRect(
      x,
      height - i * heightFactor,
      widthFactor,
      heightFactor
    );
  }
}

export default Spectrogram;
