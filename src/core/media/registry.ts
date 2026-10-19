// Registro de media en memoria: mapea assetId → File + object URL + metadata,
// y provee elementos <video> reutilizables para el preview en vivo.
// Es estado de runtime (no se serializa en el .olyfilm; los blobs van a IndexedDB en H7).

export interface MediaEntry {
  id: string;
  file: File;
  url: string;
  kind: 'video' | 'audio';
  duration: number | null;
  width: number | null;
  height: number | null;
}

const registry = new Map<string, MediaEntry>();
const videoEls = new Map<string, HTMLVideoElement>();

export function registerAsset(id: string, file: File): MediaEntry {
  const existing = registry.get(id);
  if (existing) return existing;
  const entry: MediaEntry = {
    id,
    file,
    url: URL.createObjectURL(file),
    kind: file.type.startsWith('audio') ? 'audio' : 'video',
    duration: null,
    width: null,
    height: null,
  };
  registry.set(id, entry);
  return entry;
}

export function getEntry(id: string): MediaEntry | undefined {
  return registry.get(id);
}

/** Lee duración/resolución de un clip de video cargando sus metadatos. */
export async function probeVideo(
  id: string,
): Promise<{ duration: number; width: number; height: number }> {
  const entry = registry.get(id);
  if (!entry) throw new Error(`Asset no registrado: ${id}`);
  const v = document.createElement('video');
  v.src = entry.url;
  v.preload = 'metadata';
  await new Promise<void>((resolve, reject) => {
    v.onloadedmetadata = () => resolve();
    v.onerror = () => reject(new Error(`No se pudo leer ${entry.file.name}`));
  });
  entry.duration = v.duration;
  entry.width = v.videoWidth;
  entry.height = v.videoHeight;
  return { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
}

/** Elemento <video> persistente por asset, para reproducir en el preview. */
export function getVideoEl(id: string): HTMLVideoElement {
  let el = videoEls.get(id);
  if (el) return el;
  const entry = registry.get(id);
  if (!entry) throw new Error(`Asset no registrado: ${id}`);
  el = document.createElement('video');
  el.src = entry.url;
  el.preload = 'auto';
  el.playsInline = true;
  el.crossOrigin = 'anonymous';
  videoEls.set(id, el);
  return el;
}

export function clearRegistry(): void {
  for (const entry of registry.values()) URL.revokeObjectURL(entry.url);
  for (const el of videoEls.values()) {
    el.pause();
    el.removeAttribute('src');
  }
  registry.clear();
  videoEls.clear();
}
