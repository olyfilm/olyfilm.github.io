import type { Asset } from '@/shared/types';

// Cliente Pexels para B-roll complementario. Esqueleto para H6.
// API pública con CORS; usa API key del usuario (localStorage).

export interface PexelsQuery {
  query: string;
  orientation: 'portrait';
  perPage: number;
}

export interface PexelsClient {
  search(q: PexelsQuery): Promise<Asset[]>;
  download(pexelsId: number): Promise<Blob>;
}

// TODO (H6): búsqueda + descarga a IndexedDB; el LLM arma la query desde el bloque del guion.
