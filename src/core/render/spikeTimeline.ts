import type { GuionBlock } from '@/shared/types';
import type { RenderSegment, RenderSubtitle } from './webcodecs';

/**
 * Arma una timeline provisional para el spike de render (H2): reparte los clips
 * de video en partes iguales a lo largo de la duración del guion y usa la locución
 * de cada bloque como subtítulo. Esto se reemplaza por el EDL real en H3/H4.
 */
export function buildSpikeTimeline(
  videoFiles: File[],
  blocks: GuionBlock[],
): { segments: RenderSegment[]; subtitles: RenderSubtitle[]; totalDuration: number } {
  const totalDuration = blocks.reduce((m, b) => Math.max(m, b.tEnd), 0) || 8;

  const segments: RenderSegment[] = [];
  if (videoFiles.length > 0) {
    const slice = totalDuration / videoFiles.length;
    videoFiles.forEach((file, i) => {
      segments.push({
        file,
        tlStart: i * slice,
        tlEnd: (i + 1) * slice,
        srcStart: 0,
      });
    });
  }

  const subtitles: RenderSubtitle[] = blocks
    .filter((b) => b.locucion.trim())
    .map((b) => ({ start: b.tStart, end: b.tEnd, text: b.locucion.trim() }));

  return { segments, subtitles, totalDuration };
}
