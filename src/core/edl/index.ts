import type {
  Asset,
  GuionBlock,
  SubtitleCue,
  Timeline,
  VideoClip,
} from '@/shared/types';
import type { RenderSegment, RenderSubtitle } from '@/core/render';
import { getEntry } from '@/core/media/registry';

export const emptyTimeline = (): Timeline => ({
  video: [],
  broll: [],
  overlay: [],
  subtitles: [],
  music: [],
});

// ---------- consultas sobre el EDL ----------

export const clipDuration = (c: VideoClip): number => c.srcOut - c.srcIn;
export const clipTlEnd = (c: VideoClip): number => c.tlStart + clipDuration(c);

/** Punto del clip fuente que corresponde al tiempo `t` de la timeline. */
export const srcTimeFor = (c: VideoClip, t: number): number => c.srcIn + (t - c.tlStart);

export function activeVideoClip(timeline: Timeline, t: number): VideoClip | null {
  return timeline.video.find((c) => t >= c.tlStart && t < clipTlEnd(c)) ?? null;
}

export function activeSubtitle(timeline: Timeline, t: number): string {
  return timeline.subtitles.find((c) => t >= c.start && t < c.end)?.text ?? '';
}

export function activeSubtitleCue(timeline: Timeline, t: number): SubtitleCue | null {
  return timeline.subtitles.find((c) => t >= c.start && t < c.end) ?? null;
}

/** Estilo de subtítulo activo del proyecto (el de los cues; 'default' si no hay). */
export function subtitleStyleName(timeline: Timeline): string {
  return timeline.subtitles[0]?.style ?? 'default';
}

export function totalTimelineDuration(timeline: Timeline): number {
  const vEnd = timeline.video.reduce((m, c) => Math.max(m, clipTlEnd(c)), 0);
  const sEnd = timeline.subtitles.reduce((m, c) => Math.max(m, c.end), 0);
  return Math.max(vEnd, sEnd);
}

// ---------- construcción del EDL ----------

/**
 * Arma un EDL desde el guion y el material (determinístico, sin IA): reparte los
 * clips de video a lo largo de la duración del guion y usa la locución de cada
 * bloque como subtítulo. El matching inteligente llega en H4/H5.
 */
export function buildTimelineFromAssets(videoAssets: Asset[], blocks: GuionBlock[]): Timeline {
  const total = blocks.reduce((m, b) => Math.max(m, b.tEnd), 0) || 8;

  const video: VideoClip[] = [];
  if (videoAssets.length > 0) {
    const slice = total / videoAssets.length;
    videoAssets.forEach((a, i) => {
      const dur = a.duration ?? slice;
      video.push({
        id: `v${i}`,
        assetId: a.id,
        srcIn: 0,
        srcOut: Math.min(slice, dur),
        tlStart: i * slice,
        transform: { crop9x16: true },
      });
    });
  }

  const subtitles: SubtitleCue[] = blocks
    .filter((b) => b.locucion.trim())
    .map((b, i) => ({
      id: `s${i}`,
      start: b.tStart,
      end: b.tEnd,
      text: b.locucion.trim(),
      style: 'default',
    }));

  return { video, broll: [], overlay: [], subtitles, music: [] };
}

/** Deriva los segmentos/subtítulos que consume el renderer a partir del EDL. */
export function edlToRenderSegments(timeline: Timeline): {
  segments: RenderSegment[];
  subtitles: RenderSubtitle[];
} {
  const segments: RenderSegment[] = [];
  for (const c of timeline.video) {
    const entry = getEntry(c.assetId);
    if (!entry) continue;
    segments.push({
      file: entry.file,
      tlStart: c.tlStart,
      tlEnd: clipTlEnd(c),
      srcStart: c.srcIn,
    });
  }
  const subtitles: RenderSubtitle[] = timeline.subtitles.map((c) => ({
    start: c.start,
    end: c.end,
    text: c.text,
    style: c.style,
  }));
  return { segments, subtitles };
}
