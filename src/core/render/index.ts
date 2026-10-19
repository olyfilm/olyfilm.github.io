// Render final a MP4 9:16 con WebCodecs + mp4-muxer.

export function webCodecsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'VideoEncoder' in window &&
    'VideoDecoder' in window &&
    'VideoFrame' in window
  );
}

export { renderSpike } from './webcodecs';
export type {
  RenderSegment,
  RenderSubtitle,
  RenderProgress,
  RenderSpikeOptions,
  RenderResult,
} from './webcodecs';
