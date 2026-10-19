import type { OlyfilmProject } from '@/shared/types';
import type { EdlOp } from '@/core/edl/ops';
import { clipDuration } from '@/core/edl';

// Cliente LLM (BYO API key) + planner de edición. La clave vive en localStorage y
// sólo sale del browser hacia la API de Anthropic. El SDK se importa de forma
// dinámica (chunk aparte). El LLM devuelve operaciones sobre el EDL (core/edl/ops).

const KEY_STORAGE = 'olyfilm.apiKey';
const MODEL_STORAGE = 'olyfilm.model';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5 (máxima calidad)' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (equilibrio)' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 (más barato)' },
] as const;

const DEFAULT_MODEL = 'claude-opus-5-5';

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* modo privado */
  }
}

export function getModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE) ?? DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function setModel(model: string): void {
  try {
    localStorage.setItem(MODEL_STORAGE, model);
  } catch {
    /* modo privado */
  }
}

export interface PlanResult {
  ops: EdlOp[];
  usage: { in: number; out: number };
  rawText: string;
}

function systemPrompt(): string {
  return [
    'Sos el motor de edición de olyfilm, una app que arma reels verticales 9:16.',
    'Recibís el montaje actual (EDL) y una instrucción del usuario, y respondés SOLO con',
    'un objeto JSON con la forma {"ops": [ ... ]} usando estas operaciones:',
    '- {"op":"setSubtitleText","id":"<id>","text":"<texto>"}',
    '- {"op":"removeSubtitle","id":"<id>"}',
    '- {"op":"shiftSubtitles","seconds":<número>}  // corre todos los subtítulos',
    '- {"op":"setSubtitleStyle","style":"<nombre>"}',
    '- {"op":"removeClip","id":"<id>"}',
    '- {"op":"moveClip","id":"<id>","tlStart":<segundos>}',
    '- {"op":"trimClip","id":"<id>","srcIn":<seg?>,"srcOut":<seg?>}',
    '- {"op":"setClipDuration","id":"<id>","seconds":<segundos>}',
    '- {"op":"reorderClips","order":["<id>","<id>",...]}',
    'Reglas: usá sólo ids que existan en el EDL. No inventes operaciones fuera de la lista.',
    'Si la instrucción no requiere cambios, devolvé {"ops": []}. No agregues texto fuera del JSON.',
  ].join('\n');
}

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

const round = (n: number) => Math.round(n * 100) / 100;

/** Extrae un array de operaciones de la respuesta del modelo (tolerante a fences). */
export function parseOps(text: string): EdlOp[] {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  // buscar el primer bloque JSON (objeto o array)
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

export interface PlanOptions {
  onStatus?: (s: string) => void;
}

export async function planEdits(
  project: OlyfilmProject,
  userPrompt: string,
  opts: PlanOptions = {},
): Promise<PlanResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Falta la API key. Cargala en el panel de IA.');

  opts.onStatus?.('Cargando cliente…');
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  opts.onStatus?.('Pensando la edición…');
  const message = await client.messages.create({
    model: getModel(),
    max_tokens: 4096,
    system: systemPrompt(),
    messages: [
      {
        role: 'user',
        content: `EDL actual:\n${summarizeProject(project)}\n\nInstrucción:\n${userPrompt}`,
      },
    ],
  });

  const rawText = message.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n');

  return {
    ops: parseOps(rawText),
    usage: { in: message.usage.input_tokens, out: message.usage.output_tokens },
    rawText,
  };
}
