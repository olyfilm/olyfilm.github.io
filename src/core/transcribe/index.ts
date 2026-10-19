import type { SubtitleCue } from '@/shared/types';
import type { RenderSegment } from '@/core/render';

// Transcripción local con Whisper (transformers.js). Corre en el navegador: WebGPU
// si está (iPhone 17+/Safari 26), si no WASM. No gasta tokens de API.
// El modelo se descarga una vez y queda cacheado. Se importa de forma dinámica.

const WHISPER_SR = 16_000; // Whisper espera audio mono a 16 kHz
const MODEL = 'Xenova/whisper-tiny'; // multilingüe (incluye español)

export interface TranscribeProgress {
  stage: 'download' | 'transcribe';
  detail: string;
  ratio?: number; // 0..1 en la descarga del modelo
}

export interface TranscribeOptions {
  language?: string; // p.ej. 'spanish'; undefined = autodetección
  onProgress?: (p: TranscribeProgress) => void;
}

/** Mezcla el audio de la timeline a mono 16 kHz (lo que consume Whisper). */
export async function timelineMono16k(
  segments: RenderSegment[],
  total: number,
): Promise<Float32Array> {
  const totalSamples = Math.ceil(total * WHISPER_SR);
  const out = new Float32Array(totalSamples);
  const ctx = new AudioContext({ sampleRate: WHISPER_SR });
  try {
    for (const seg of segments) {
      let buf: AudioBuffer;
      try {
        buf = await ctx.decodeAudioData(await seg.file.arrayBuffer());
      } catch {
        continue;
      }
      const srcStart = Math.floor(seg.srcStart * WHISPER_SR);
      const dstStart = Math.floor(seg.tlStart * WHISPER_SR);
      const dur = seg.tlEnd - seg.tlStart;
      const copyLen = Math.min(
        Math.floor(dur * WHISPER_SR),
        buf.length - srcStart,
        totalSamples - dstStart,
      );
      if (copyLen <= 0) continue;
      const ch0 = buf.getChannelData(0);
      for (let i = 0; i < copyLen; i++) out[dstStart + i] = ch0[srcStart + i] ?? 0;
    }
  } finally {
    await ctx.close();
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipePromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPipeline(onProgress?: TranscribeOptions['onProgress']): Promise<any> {
  if (!pipePromise) {
    pipePromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      return pipeline('automatic-speech-recognition', MODEL, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        progress_callback: (p: any) => {
          if (p?.status === 'progress' && onProgress) {
            onProgress({
              stage: 'download',
              detail: p.file ?? 'modelo',
              ratio: typeof p.progress === 'number' ? p.progress / 100 : undefined,
            });
          }
        },
      });
    })();
  }
  return pipePromise;
}

/** Transcribe el audio de la timeline → subtítulos con timestamps en tiempo de salida. */
export async function transcribeTimeline(
  segments: RenderSegment[],
  total: number,
  opts: TranscribeOptions = {},
): Promise<SubtitleCue[]> {
  const audio = await timelineMono16k(segments, total);
  if (audio.length === 0) return [];

  const transcriber = await getPipeline(opts.onProgress);
  opts.onProgress?.({ stage: 'transcribe', detail: 'Reconociendo voz…' });

  const out = await transcriber(audio, {
    return_timestamps: true,
    chunk_length_s: 30,
    task: 'transcribe',
    language: opts.language,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chunks: any[] = out?.chunks ?? [];
  return chunks
    .filter((c) => (c?.text ?? '').trim())
    .map((c, i) => {
      const start = c.timestamp?.[0] ?? 0;
      const end = c.timestamp?.[1] ?? start + 2;
      return {
        id: `t${i}`,
        start,
        end: Math.max(end, start + 0.3),
        text: String(c.text).trim(),
        style: 'default',
      } satisfies SubtitleCue;
    });
}
