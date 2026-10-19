import type { StockVideo } from '@/core/broll';

export function getPixabayKey(): string | null {
  try { return localStorage.getItem('olyfilm.pixabayKey'); } catch { return null; }
}

export function setPixabayKey(key: string): void {
  try {
    if (key) localStorage.setItem('olyfilm.pixabayKey', key);
    else localStorage.removeItem('olyfilm.pixabayKey');
  } catch { /* modo privado */ }
}

interface VideoFile {
  url: string;
  width: number;
  height: number;
  thumbnail?: string;
}
interface Hit {
  id: number;
  duration: number;
  user: string;
  videos: Record<string, VideoFile>;
}

// Pixabay exige cachear las búsquedas durante 24 horas; no persistir la API key.
const cache = new Map<string, { at: number; videos: StockVideo[] }>();
export async function searchPixabay(query: string): Promise<StockVideo[]> {
  const key = getPixabayKey();
  if (!key) throw new Error('Falta la API key de Pixabay.');
  if (query.length > 100) throw new Error('Pixabay admite búsquedas de hasta 100 caracteres.');
  const cacheKey = `olyfilm.pixabaySearch.${encodeURIComponent(query)}`;
  let cached = cache.get(cacheKey);
  try { cached ??= JSON.parse(localStorage.getItem(cacheKey) ?? 'null'); } catch { /* sin caché */ }
  if (cached && Date.now() - cached.at < 24 * 60 * 60 * 1000) return cached.videos;
  const params = new URLSearchParams({ key, q: query, lang: 'es', per_page: '12', safesearch: 'true' });
  const res = await fetch(`https://pixabay.com/api/videos/?${params}`);
  if (!res.ok) throw new Error(`Pixabay ${res.status}: ${res.statusText}`);
  const data: { hits?: Hit[] } = await res.json();
  const videos = (data.hits ?? []).flatMap((hit): StockVideo[] => {
    const files = Object.values(hit.videos).filter((f) => f.url && f.width > 0 && f.height > 0);
    const big = files.filter((f) => f.height >= 1080).sort((a, b) => a.height - b.height);
    const file = big[0] ?? files.sort((a, b) => b.height - a.height)[0];
    if (!file) return [];
    return [{ provider: 'pixabay', id: hit.id, thumb: file.thumbnail ?? '',
      duration: hit.duration, width: file.width, height: file.height,
      fileUrl: file.url, author: hit.user || 'Pixabay' }];
  });
  const entry = { at: Date.now(), videos };
  cache.set(cacheKey, entry);
  try { localStorage.setItem(cacheKey, JSON.stringify(entry)); } catch { /* caché en memoria */ }
  return videos;
}
