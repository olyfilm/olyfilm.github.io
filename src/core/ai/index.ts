// Cliente LLM (BYO API key) + medidor de tokens. Esqueleto para H5.
// La clave vive en localStorage y nunca sale del browser salvo hacia la API del proveedor.

export interface TokenUsage {
  in: number;
  out: number;
}

export interface LlmResult<T> {
  data: T;
  usage: TokenUsage;
}

export interface LlmClient {
  /** Completa un prompt y devuelve el resultado junto al uso real de tokens. */
  complete(system: string, user: string): Promise<LlmResult<string>>;
}

const KEY_STORAGE = 'olyfilm.apiKey';

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setApiKey(key: string): void {
  try {
    localStorage.setItem(KEY_STORAGE, key);
  } catch {
    /* modo privado: la clave no persiste */
  }
}

// TODO (H5): implementación concreta del proveedor (Anthropic por defecto, agnóstico).
// El `usage` de cada respuesta alimenta el contador global (store.addTokens).
