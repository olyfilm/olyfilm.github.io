// Cliente Pexels para B-roll complementario. API pública con CORS; usa una API key
// del usuario (gratuita) guardada en localStorage. Devuelve candidatos verticales.

const KEY_STORAGE = 'olyfilm.pexelsKey';
const API = 'https://api.pexels.com/videos/search';

export function getPexelsKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setPexelsKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* modo privado */
  }
}

export interface PexelsVideo {
  pexelsId: number;
  thumb: string;
  duration: number;
  width: number;
  height: number;
  fileUrl: string;
  author: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickPortraitFile(files: any[]): any | null {
  const mp4 = files.filter((f) => f.file_type === 'video/mp4');
  const portrait = mp4.filter((f) => f.height >= f.width);
  const pool = portrait.length ? portrait : mp4;
  if (!pool.length) return null;
  // preferir el más chico con alto >= 1080 (calidad suficiente, menos peso)
  const big = pool.filter((f) => f.height >= 1080).sort((a, b) => a.height - b.height);
  return big[0] ?? pool.sort((a, b) => b.height - a.height)[0];
}

export async function searchPexels(query: string, perPage = 12): Promise<PexelsVideo[]> {
  const key = getPexelsKey();
  if (!key) throw new Error('Falta la API key de Pexels.');

  const url = `${API}?query=${encodeURIComponent(query)}&orientation=portrait&per_page=${perPage}`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels ${res.status}: ${res.statusText}`);
  const data = await res.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.videos ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((v: any): PexelsVideo | null => {
      const file = pickPortraitFile(v.video_files ?? []);
      if (!file) return null;
      return {
        pexelsId: v.id,
        thumb: v.image,
        duration: v.duration,
        width: file.width,
        height: file.height,
        fileUrl: file.link,
        author: v.user?.name ?? 'Pexels',
      };
    })
    .filter(Boolean) as PexelsVideo[];
}

export async function downloadPexels(video: PexelsVideo): Promise<File> {
  const res = await fetch(video.fileUrl);
  if (!res.ok) throw new Error(`No se pudo descargar el clip (${res.status}).`);
  const blob = await res.blob();
  return new File([blob], `pexels-${video.pexelsId}.mp4`, { type: 'video/mp4' });
}
