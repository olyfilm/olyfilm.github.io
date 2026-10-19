import type { Asset, AssetOrigin, Guion, OlyfilmProject, VideoClip } from '@/shared/types';
import { emptyUsage } from '@/shared/types';
import { emptyTimeline, totalTimelineDuration } from '@/core/edl';
import { probeVideo, registerAsset } from '@/core/media/registry';

const uid = () =>
  crypto.randomUUID?.() ?? `a${Date.now()}${Math.random().toString(36).slice(2)}`;

export interface NewProjectInput {
  name: string;
  guion: Guion;
}

export function createProject({ name, guion }: NewProjectInput): OlyfilmProject {
  return {
    version: 1,
    meta: {
      name,
      createdAt: new Date().toISOString(),
      aspect: '9:16',
      fps: 30,
      resolution: [1080, 1920],
    },
    guion,
    assets: [],
    timeline: emptyTimeline(),
    promptHistory: [],
    usage: emptyUsage(),
    renderSettings: { codec: 'avc', bitrate: '8M', burnSubtitles: true },
  };
}

/**
 * Registra un clip de video (local o de Pexels), lee su metadata y lo appendea al
 * final de la timeline. Devuelve un proyecto nuevo (inmutable).
 */
export async function appendVideoClip(
  project: OlyfilmProject,
  file: File,
  origin: AssetOrigin = 'local',
  pexelsId: number | null = null,
): Promise<OlyfilmProject> {
  const id = uid();
  registerAsset(id, file);
  let duration: number | null = null;
  let resolution: [number, number] | null = null;
  try {
    const p = await probeVideo(id);
    duration = Math.round(p.duration * 100) / 100;
    resolution = [p.width, p.height];
  } catch {
    /* clip ilegible */
  }

  const asset: Asset = {
    id,
    kind: 'video',
    name: file.name,
    origin,
    duration,
    resolution,
    blobRef: null,
    pexelsId,
  };
  const tlStart = totalTimelineDuration(project.timeline);
  const clip: VideoClip = {
    id: `v_${id.slice(0, 6)}`,
    assetId: id,
    srcIn: 0,
    srcOut: duration ?? 5,
    tlStart,
    transform: { crop9x16: true },
  };

  return {
    ...project,
    assets: [...project.assets, asset],
    timeline: { ...project.timeline, video: [...project.timeline.video, clip] },
  };
}

/** Serializa el proyecto al formato `.olyfilm` (JSON). Los blobs NO se embeben. */
export function serializeProject(project: OlyfilmProject): string {
  return JSON.stringify(project, null, 2);
}

export function parseProject(json: string): OlyfilmProject {
  const data = JSON.parse(json) as OlyfilmProject;
  if (data.version !== 1) throw new Error(`Versión .olyfilm no soportada: ${data.version}`);
  return data;
}

// TODO (H7): persistencia de blobs en IndexedDB + guardar/abrir vía File System Access API.
