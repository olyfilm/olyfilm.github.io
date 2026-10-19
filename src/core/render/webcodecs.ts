import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { aacNativeSupported, buildTimelineAudio, encodeAacNative, encodeWav } from './audio';
import { drawCover, drawSubtitle } from '@/core/compositor';

// Render (PLAN.md H2 + audio): decodifica clips con un <video> (seek por frame),
// recorta a 9:16 (cover), quema subtítulos en canvas, codifica con VideoEncoder,
// extrae el audio y lo codifica a AAC, y muxea todo a MP4 con mp4-muxer.

export interface RenderSegment {
  file: File;
  tlStart: number; // inicio en la línea de tiempo de salida (s)
  tlEnd: number; // fin en la línea de tiempo de salida (s)
  srcStart: number; // punto de entrada en el clip fuente (s)
}

export interface RenderSubtitle {
  start: number;
  end: number;
  text: string;
}

export interface RenderProgress {
  frame: number;
  totalFrames: number;
  stage: string;
}

export interface RenderSpikeOptions {
  segments: RenderSegment[];
  subtitles: RenderSubtitle[];
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  onProgress?: (p: RenderProgress) => void;
}

export interface RenderResult {
  blob: Blob;
  durationMs: number;
  codec: string;
  audio: 'aac' | 'none';
  audioEngine: 'native' | 'wasm' | null; // cómo se produjo el AAC
}

const CODEC_CANDIDATES = ['avc1.4d0028', 'avc1.640028', 'avc1.42e028', 'avc1.42001f'];

async function pickCodec(width: number, height: number, fps: number, bitrate: number): Promise<string> {
  for (const codec of CODEC_CANDIDATES) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        framerate: fps,
        bitrate,
      });
      if (supported) return codec;
    } catch {
      /* probar el siguiente */
    }
  }
  throw new Error('Ningún códec AVC soportado por VideoEncoder en este navegador.');
}

/** Crea un <video> listo para seekear a partir de un File. */
async function loadVideo(file: File): Promise<{ el: HTMLVideoElement; url: string }> {
  const url = URL.createObjectURL(file);
  const el = document.createElement('video');
  el.src = url;
  el.muted = true;
  el.playsInline = true;
  el.preload = 'auto';
  el.style.position = 'fixed';
  el.style.left = '-9999px';
  el.style.width = '1px';
  el.style.height = '1px';
  document.body.appendChild(el);
  await new Promise<void>((resolve, reject) => {
    el.onloadedmetadata = () => resolve();
    el.onerror = () => reject(new Error(`No se pudo decodificar ${file.name}`));
  });
  return { el, url };
}

function seek(el: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const target = Math.min(Math.max(t, 0), Math.max(0, el.duration - 1e-3));
    if (Math.abs(el.currentTime - target) < 1e-3) {
      resolve();
      return;
    }
    const onSeeked = () => {
      el.removeEventListener('seeked', onSeeked);
      resolve();
    };
    el.addEventListener('seeked', onSeeked);
    el.currentTime = target;
  });
}

export async function renderSpike(opts: RenderSpikeOptions): Promise<RenderResult> {
  const { segments, subtitles, width, height, fps, bitrate, onProgress } = opts;
  const t0 = performance.now();

  const totalDuration = segments.reduce((m, s) => Math.max(m, s.tlEnd), 0);
  const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
  const frameDurUs = Math.round(1_000_000 / fps);

  onProgress?.({ frame: 0, totalFrames, stage: 'Preparando códec' });
  const codec = await pickCodec(width, height, fps, bitrate);

  // Audio: decodificar + reubicar en la timeline; AAC nativo si el navegador puede.
  onProgress?.({ frame: 0, totalFrames, stage: 'Extrayendo audio' });
  const timelineAudio = await buildTimelineAudio(segments, totalDuration);
  const nativeAac = timelineAudio ? await aacNativeSupported(timelineAudio) : false;

  // cargar todos los clips
  const loaded = new Map<RenderSegment, { el: HTMLVideoElement; url: string }>();
  const cleanup = () => {
    for (const { el, url } of loaded.values()) {
      el.remove();
      URL.revokeObjectURL(url);
    }
  };

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    ...(nativeAac && timelineAudio
      ? { audio: { codec: 'aac', numberOfChannels: timelineAudio.channels, sampleRate: timelineAudio.sampleRate } }
      : {}),
    fastStart: 'in-memory',
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      throw e;
    },
  });
  encoder.configure({ codec, width, height, framerate: fps, bitrate });

  try {
    onProgress?.({ frame: 0, totalFrames, stage: 'Cargando clips' });
    for (const seg of segments) {
      if (!loaded.has(seg)) loaded.set(seg, await loadVideo(seg.file));
    }

    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps;

      const seg = segments.find((s) => t >= s.tlStart && t < s.tlEnd);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      if (seg) {
        const { el } = loaded.get(seg)!;
        await seek(el, seg.srcStart + (t - seg.tlStart));
        drawCover(ctx, el, width, height);
      }

      const cue = subtitles.find((c) => t >= c.start && t < c.end);
      if (cue) drawSubtitle(ctx, cue.text, width, height);

      const frame = new VideoFrame(canvas, { timestamp: f * frameDurUs, duration: frameDurUs });
      encoder.encode(frame, { keyFrame: f % fps === 0 });
      frame.close();

      // backpressure: no dejar crecer la cola del encoder
      while (encoder.encodeQueueSize > fps) {
        await new Promise((r) => setTimeout(r, 1));
      }

      if (f % 5 === 0 || f === totalFrames - 1) {
        onProgress?.({ frame: f + 1, totalFrames, stage: 'Codificando' });
      }
    }

    await encoder.flush();

    // Camino nativo: muxea AAC en la misma pasada (iPhone 17+, Win/Mac, Android).
    if (nativeAac && timelineAudio) {
      onProgress?.({ frame: totalFrames, totalFrames, stage: 'Codificando audio (AAC nativo)' });
      await encodeAacNative(timelineAudio, (chunk, meta) => muxer.addAudioChunk(chunk, meta));
    }

    onProgress?.({ frame: totalFrames, totalFrames, stage: 'Finalizando MP4' });
    muxer.finalize();

    let blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    let audio: 'aac' | 'none' = nativeAac && timelineAudio ? 'aac' : 'none';
    let audioEngine: 'native' | 'wasm' | null = nativeAac && timelineAudio ? 'native' : null;

    // Fallback: hay audio pero no AAC nativo → ffmpeg.wasm lazy codifica + muxea AAC.
    if (!nativeAac && timelineAudio) {
      onProgress?.({ frame: totalFrames, totalFrames, stage: 'Codificando audio (AAC · WASM)' });
      const { muxAacWithFfmpeg } = await import('./ffmpegAac');
      const wav = encodeWav(timelineAudio);
      blob = await muxAacWithFfmpeg(blob, wav);
      audio = 'aac';
      audioEngine = 'wasm';
    }

    return { blob, durationMs: performance.now() - t0, codec, audio, audioEngine };
  } finally {
    cleanup();
    if (encoder.state !== 'closed') encoder.close();
  }
}
