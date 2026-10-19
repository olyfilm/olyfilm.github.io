import { getPexelsKey, searchPexels } from '@/core/pexels';
import { searchPixabay } from '@/core/pixabay';

export type BrollProvider = 'none' | 'pexels' | 'pixabay';
export interface StockVideo {
  provider: Exclude<BrollProvider, 'none'>;
  id: number;
  thumb: string;
  duration: number;
  width: number;
  height: number;
  fileUrl: string;
  author: string;
}

export function getBrollProvider(): BrollProvider {
  try {
    const value = localStorage.getItem('olyfilm.brollProvider');
    if (value === 'none' || value === 'pexels' || value === 'pixabay') return value;
  } catch { /* modo privado */ }
  return getPexelsKey() ? 'pexels' : 'none';
}

export function setBrollProvider(provider: BrollProvider): void {
  try { localStorage.setItem('olyfilm.brollProvider', provider); } catch { /* modo privado */ }
}

export async function searchBroll(provider: BrollProvider, query: string): Promise<StockVideo[]> {
  if (provider === 'none') return [];
  if (provider === 'pixabay') return searchPixabay(query);
  return (await searchPexels(query)).map((v) => ({ ...v, provider: 'pexels', id: v.pexelsId }));
}

export async function downloadBroll(video: StockVideo): Promise<File> {
  const res = await fetch(video.fileUrl);
  if (!res.ok) throw new Error(`No se pudo descargar el clip (${res.status}).`);
  return new File([await res.blob()], `${video.provider}-${video.id}.mp4`, { type: 'video/mp4' });
}
