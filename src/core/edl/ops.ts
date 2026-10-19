import type { Timeline, VideoClip } from '@/shared/types';

// Operaciones sobre el EDL. TODA edición —de la UI o de un prompt de IA— pasa por
// acá: el LLM nunca toca pixeles, sólo emite estas operaciones (PLAN.md §6).
// applyOps es puro y determinístico: clona el timeline y devuelve warnings.

export type EdlOp =
  | { op: 'setSubtitleText'; id: string; text: string }
  | { op: 'removeSubtitle'; id: string }
  | { op: 'shiftSubtitles'; seconds: number }
  | { op: 'setSubtitleStyle'; style: string }
  | { op: 'removeClip'; id: string }
  | { op: 'moveClip'; id: string; tlStart: number }
  | { op: 'trimClip'; id: string; srcIn?: number; srcOut?: number }
  | { op: 'setClipDuration'; id: string; seconds: number }
  | { op: 'reorderClips'; order: string[] };

export interface ApplyResult {
  timeline: Timeline;
  applied: number;
  warnings: string[];
}

const clone = (t: Timeline): Timeline => ({
  video: t.video.map((c) => ({ ...c, transform: { ...c.transform } })),
  broll: t.broll.map((c) => ({ ...c, transform: { ...c.transform } })),
  overlay: t.overlay.map((c) => ({ ...c })),
  subtitles: t.subtitles.map((c) => ({ ...c })),
  music: t.music.map((c) => ({ ...c })),
});

/** Recoloca los clips de video en secuencia desde t=0 preservando sus duraciones. */
function relayout(clips: VideoClip[]): void {
  let t = 0;
  for (const c of clips) {
    c.tlStart = t;
    t += c.srcOut - c.srcIn;
  }
}

export function applyOps(timeline: Timeline, ops: EdlOp[]): ApplyResult {
  const t = clone(timeline);
  const warnings: string[] = [];
  let applied = 0;

  const findClip = (id: string) => t.video.find((c) => c.id === id);
  const findCue = (id: string) => t.subtitles.find((c) => c.id === id);

  for (const op of ops) {
    try {
      switch (op.op) {
        case 'setSubtitleText': {
          const c = findCue(op.id);
          if (!c) { warnings.push(`Subtítulo inexistente: ${op.id}`); continue; }
          c.text = String(op.text);
          break;
        }
        case 'removeSubtitle': {
          const before = t.subtitles.length;
          t.subtitles = t.subtitles.filter((c) => c.id !== op.id);
          if (t.subtitles.length === before) { warnings.push(`Subtítulo inexistente: ${op.id}`); continue; }
          break;
        }
        case 'shiftSubtitles': {
          const d = Number(op.seconds) || 0;
          for (const c of t.subtitles) {
            c.start = Math.max(0, c.start + d);
            c.end = Math.max(c.start + 0.1, c.end + d);
          }
          break;
        }
        case 'setSubtitleStyle': {
          for (const c of t.subtitles) c.style = String(op.style);
          break;
        }
        case 'removeClip': {
          const before = t.video.length;
          t.video = t.video.filter((c) => c.id !== op.id);
          if (t.video.length === before) { warnings.push(`Clip inexistente: ${op.id}`); continue; }
          relayout(t.video);
          break;
        }
        case 'moveClip': {
          const c = findClip(op.id);
          if (!c) { warnings.push(`Clip inexistente: ${op.id}`); continue; }
          c.tlStart = Math.max(0, Number(op.tlStart) || 0);
          break;
        }
        case 'trimClip': {
          const c = findClip(op.id);
          if (!c) { warnings.push(`Clip inexistente: ${op.id}`); continue; }
          if (op.srcIn != null) c.srcIn = Math.max(0, Number(op.srcIn));
          if (op.srcOut != null) c.srcOut = Number(op.srcOut);
          if (c.srcOut <= c.srcIn) { warnings.push(`Recorte inválido en ${op.id}`); continue; }
          relayout(t.video);
          break;
        }
        case 'setClipDuration': {
          const c = findClip(op.id);
          if (!c) { warnings.push(`Clip inexistente: ${op.id}`); continue; }
          const d = Number(op.seconds);
          if (!(d > 0)) { warnings.push(`Duración inválida en ${op.id}`); continue; }
          c.srcOut = c.srcIn + d;
          relayout(t.video);
          break;
        }
        case 'reorderClips': {
          const byId = new Map(t.video.map((c) => [c.id, c]));
          const ordered: VideoClip[] = [];
          for (const id of op.order) {
            const c = byId.get(id);
            if (c && !ordered.includes(c)) ordered.push(c);
          }
          for (const c of t.video) if (!ordered.includes(c)) ordered.push(c);
          t.video = ordered;
          relayout(t.video);
          break;
        }
        default:
          warnings.push(`Operación desconocida: ${JSON.stringify(op)}`);
          continue;
      }
      applied++;
    } catch {
      warnings.push(`Error aplicando ${op.op ?? 'op'}`);
    }
  }

  return { timeline: t, applied, warnings };
}
