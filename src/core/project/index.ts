import type { Guion, OlyfilmProject } from '@/shared/types';
import { emptyUsage } from '@/shared/types';
import { emptyTimeline } from '@/core/edl';

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
