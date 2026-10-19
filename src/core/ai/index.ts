import type { OlyfilmProject } from '@/shared/types';
import type { EdlOp } from '@/core/edl/ops';
import { clipDuration } from '@/core/edl';

// Cliente LLM multi-proveedor (BYO API key). Las keys viven en localStorage y sólo
// salen del browser hacia el proveedor elegido. El LLM devuelve operaciones sobre el
// EDL (core/edl/ops).
//
// - Anthropic (Claude): llamada directa, soporta acceso directo desde el browser.
// - OpenRouter: API compatible con OpenAI que SÍ permite CORS desde el browser, así
//   se pueden usar modelos de OpenAI (GPT-4o, etc.) sin backend. OpenAI directo no
//   funciona desde una SPA estática (bloquea CORS).

export type Provider = 'anthropic' | 'openrouter';

export const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'anthropic', label: 'Claude (directo)' },
  { id: 'openrouter', label: 'OpenAI / otros (OpenRouter)' },
];

export const MODELS_BY_PROVIDER: Record<Provider, { id: string; label: string }[]> = {
  anthropic: [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (máxima)' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (equilibrio)' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (barato)' },
  ],
  openrouter: [
    { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (barato)' },
    { id: 'openai/gpt-4o', label: 'GPT-4o' },
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (vía OpenRouter)' },
  ],
};

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-opus-5-5',
  openrouter: 'openai/gpt-4o-mini',
};

const K = {
  anthropic: 'olyfilm.apiKey',
  openrouter: 'olyfilm.openrouterKey',
  provider: 'olyfilm.provider',
  model: 'olyfilm.model',
};

const ls = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      if (v) localStorage.setItem(k, v);
      else localStorage.removeItem(k);
    } catch {
      /* modo privado */
    }
  },
};

// ---- provider / model ----

export function getProvider(): Provider {
  const p = ls.get(K.provider);
  return p === 'openrouter' ? 'openrouter' : 'anthropic';
}
export function setProvider(p: Provider): void {
  ls.set(K.provider, p);
}

export function getModel(): string {
  return ls.get(K.model) ?? DEFAULT_MODEL[getProvider()];
}
export function setModel(model: string): void {
  ls.set(K.model, model);
}
export function defaultModelFor(p: Provider): string {
  return DEFAULT_MODEL[p];
}

// ---- keys ----

export function getApiKey(): string | null {
  return ls.get(K.anthropic);
}
export function setApiKey(key: string): void {
  ls.set(K.anthropic, key);
}
export function getOpenRouterKey(): string | null {
  return ls.get(K.openrouter);
}
export function setOpenRouterKey(key: string): void {
  ls.set(K.openrouter, key);
}
/** Key del proveedor activo (o el indicado). */
export function getProviderKey(p: Provider = getProvider()): string | null {
  return p === 'openrouter' ? getOpenRouterKey() : getApiKey();
}

// ---- planner ----

export interface PlanResult {
  ops: EdlOp[];
  usage: { in: number; out: number };
  rawText: string;
}

export interface PlanOptions {
  onStatus?: (s: string) => void;
}

function systemPrompt(): string {
  return [
    'Sos el motor de edición de olyfilm, una app que arma reels verticales 9:16.',
    'Recibís el montaje actual (EDL) y una instrucción del usuario, y respondés SOLO con',
    'un objeto JSON con la forma {"ops": [ ... ]} usando estas operaciones:',
    '- {"op":"setSubtitleText","id":"<id>","text":"<texto>"}',
    '- {"op":"removeSubtitle","id":"<id>"}',
    '- {"op":"shiftSubtitles","seconds":<número>}  // corre todos los subtítulos',
    '- {"op":"setSubtitleStyle","style":"default|boxed|yellow|center"}',
    '- {"op":"removeClip","id":"<id>"}',
    '- {"op":"moveClip","id":"<id>","tlStart":<segundos>}',
    '- {"op":"trimClip","id":"<id>","srcIn":<seg?>,"srcOut":<seg?>}',
    '- {"op":"setClipDuration","id":"<id>","seconds":<segundos>}',
    '- {"op":"reorderClips","order":["<id>","<id>",...]}',
    'Reglas: usá sólo ids que existan en el EDL. No inventes operaciones fuera de la lista.',
    'Si la instrucción no requiere cambios, devolvé {"ops": []}. No agregues texto fuera del JSON.',
  ].join('\n');
}

const round = (n: number) => Math.round(n * 100) / 100;

function summarizeProject(project: OlyfilmProject): string {
  const clips = project.timeline.video.map((c) => ({
    id: c.id,
    tlStart: round(c.tlStart),
    dur: round(clipDuration(c)),
    srcIn: round(c.srcIn),
    srcOut: round(c.srcOut),
  }));
  const subs = project.timeline.subtitles.map((c) => ({
    id: c.id,
    start: round(c.start),
    end: round(c.end),
    text: c.text,
  }));
  return JSON.stringify({ clips, subtitles: subs }, null, 0);
}

/** Extrae un array de operaciones de la respuesta del modelo (tolerante a fences). */
export function parseOps(text: string): EdlOp[] {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const match = cleaned.match(/[[{][\s\S]*[\]}]/);
  const raw = match ? match[0] : cleaned;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const arr = Array.isArray(data)
    ? data
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Array.isArray((data as any)?.ops)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data as any).ops
      : [];
  return arr.filter((o: unknown) => o && typeof o === 'object' && 'op' in o) as EdlOp[];
}

async function planWithAnthropic(key: string, model: string, sys: string, user: string, onStatus?: (s: string) => void) {
  onStatus?.('Cargando cliente…');
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  onStatus?.('Pensando la edición…');
  const msg = await client.messages.create({
    model,
    max_tokens: 4096,
    system: sys,
    messages: [{ role: 'user', content: user }],
  });
  const rawText = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  return { rawText, usage: { in: msg.usage.input_tokens, out: msg.usage.output_tokens } };
}

async function planWithOpenRouter(key: string, model: string, sys: string, user: string, onStatus?: (s: string) => void) {
  onStatus?.('Pensando la edición…');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://olyfilm.github.io',
      'X-Title': 'olyfilm',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2048,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 180)}`);
  const data = await res.json();
  const rawText = data.choices?.[0]?.message?.content ?? '';
  return {
    rawText,
    usage: { in: data.usage?.prompt_tokens ?? 0, out: data.usage?.completion_tokens ?? 0 },
  };
}

export async function planEdits(
  project: OlyfilmProject,
  userPrompt: string,
  opts: PlanOptions = {},
): Promise<PlanResult> {
  const provider = getProvider();
  const key = getProviderKey(provider);
  if (!key) throw new Error(`Falta la API key de ${provider === 'openrouter' ? 'OpenRouter' : 'Anthropic'}.`);

  const model = getModel();
  const sys = systemPrompt();
  const user = `EDL actual:\n${summarizeProject(project)}\n\nInstrucción:\n${userPrompt}`;

  const { rawText, usage } =
    provider === 'anthropic'
      ? await planWithAnthropic(key, model, sys, user, opts.onStatus)
      : await planWithOpenRouter(key, model, sys, user, opts.onStatus);

  return { ops: parseOps(rawText), usage, rawText };
}

/** Una llamada al proveedor configurado; contabilizar antes de interpretar el JSON. */
export async function requestPlan(system: string, user: string, opts: PlanOptions = {}) {
  const provider = getProvider();
  const key = getProviderKey(provider);
  if (!key) throw new Error('Falta la API key del proveedor de IA.');
  return provider === 'anthropic'
    ? planWithAnthropic(key, getModel(), system, user, opts.onStatus)
    : planWithOpenRouter(key, getModel(), system, user, opts.onStatus);
}
