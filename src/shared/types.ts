// Tipos del dominio olyfilm. Reflejan el modelo `.olyfilm` descrito en PLAN.md §3.

export type Aspect = '9:16';

export interface ProjectMeta {
  name: string;
  createdAt: string;
  aspect: Aspect;
  fps: number;
  resolution: [number, number];
}

/** Un bloque del guion, parseado de la tabla "Guion por tiempos". */
export interface GuionBlock {
  id: string;
  tStart: number; // segundos
  tEnd: number;
  estructura: string; // Gancho, Desarrollo, Recompensa, Cierre...
  locucion: string;
  textoPantalla: string;
  corte: string; // texto crudo de la columna "Imagen y edición"
  imagenEdicion: string;
}

export interface Guion {
  rawMarkdown: string;
  blocks: GuionBlock[];
}

export type AssetKind = 'video' | 'audio';
export type AssetOrigin = 'local' | 'pexels';

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  origin: AssetOrigin;
  duration: number | null;
  resolution: [number, number] | null;
  blobRef: string | null; // clave en IndexedDB
  pexelsId: number | null;
}

export interface Transform {
  crop9x16: boolean;
}

export interface VideoClip {
  id: string;
  assetId: string;
  srcIn: number;
  srcOut: number;
  tlStart: number;
  transform: Transform;
}

export interface OverlayClip {
  id: string;
  text: string;
  tlStart: number;
  duration: number;
  style: string;
}

export interface SubtitleCue {
  id: string;
  start: number;
  end: number;
  text: string;
  style: string;
}

export interface MusicClip {
  id: string;
  assetId: string;
  tlStart: number;
  gain: number;
}

export interface Timeline {
  video: VideoClip[];
  broll: VideoClip[];
  overlay: OverlayClip[];
  subtitles: SubtitleCue[];
  music: MusicClip[];
}

export interface PromptEntry {
  ts: string;
  prompt: string;
  summaryOfChange: string;
  tokens: { in: number; out: number };
}

/** Uso de tokens acumulado del proyecto (PLAN.md §7). */
export interface Usage {
  totalIn: number;
  totalOut: number;
  byStage: {
    cocinado: number;
    prompts: number;
    transcribe: number;
  };
}

export interface RenderSettings {
  codec: 'avc';
  bitrate: string;
  burnSubtitles: boolean;
}

export interface OlyfilmProject {
  version: 1;
  meta: ProjectMeta;
  guion: Guion;
  assets: Asset[];
  timeline: Timeline;
  promptHistory: PromptEntry[];
  usage: Usage;
  renderSettings: RenderSettings;
}

export const emptyUsage = (): Usage => ({
  totalIn: 0,
  totalOut: 0,
  byStage: { cocinado: 0, prompts: 0, transcribe: 0 },
});
