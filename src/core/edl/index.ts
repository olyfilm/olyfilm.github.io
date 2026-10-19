import type { Timeline } from '@/shared/types';

export const emptyTimeline = (): Timeline => ({
  video: [],
  broll: [],
  overlay: [],
  subtitles: [],
  music: [],
});

// TODO (H3/H5): operaciones sobre el EDL (split, trim, insert, move).
// Toda edición —de la UI o de un prompt de IA— pasa por acá.
