import type { RenderSegment } from './webcodecs';

// Extracción, reubicación y codificación de audio para el render.
//
// Target de producción: iPhone 17+ (iOS 26 / Safari 26), que soporta AudioEncoder
// con AAC nativo → ese es el camino principal (rápido, sin descargas).
// En navegadores sin AAC nativo (Linux/Firefox de dev, iOS < 26) se usa un fallback
// ffmpeg.wasm cargado de forma lazy (ver ffmpegAac.ts), para que el audio siempre
// termine en AAC y nunca quede mudo.

export interface TimelineAudio {
  planar: Float32Array[]; // una Float32Array por canal
  sampleRate: number;
  channels: number;
}

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const AAC_CODEC = 'mp4a.40.2'; // AAC-LC
const AUDIO_BITRATE = 128_000;

/**
 * Decodifica el audio de cada clip y lo copia en su posición de la timeline.
 * Devuelve null si ningún clip tenía audio decodificable.
 */
export async function buildTimelineAudio(
  segments: RenderSegment[],
  totalDuration: number,
): Promise<TimelineAudio | null> {
  const totalSamples = Math.ceil(totalDuration * SAMPLE_RATE);
  const out = Array.from({ length: CHANNELS }, () => new Float32Array(totalSamples));
  let anyAudio = false;

  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    for (const seg of segments) {
      let buf: AudioBuffer;
      try {
        buf = await ctx.decodeAudioData(await seg.file.arrayBuffer());
      } catch {
        continue; // clip sin pista de audio o no decodificable
      }
      anyAudio = true;

      const segDur = seg.tlEnd - seg.tlStart;
      const srcStart = Math.floor(seg.srcStart * SAMPLE_RATE);
      const dstStart = Math.floor(seg.tlStart * SAMPLE_RATE);
      const copyLen = Math.min(
        Math.floor(segDur * SAMPLE_RATE),
        buf.length - srcStart,
        totalSamples - dstStart,
      );
      if (copyLen <= 0) continue;

      for (let ch = 0; ch < CHANNELS; ch++) {
        const srcCh = buf.getChannelData(ch < buf.numberOfChannels ? ch : 0);
        const dst = out[ch];
        for (let i = 0; i < copyLen; i++) {
          dst[dstStart + i] = srcCh[srcStart + i] ?? 0;
        }
      }
    }
  } finally {
    await ctx.close();
  }

  return anyAudio ? { planar: out, sampleRate: SAMPLE_RATE, channels: CHANNELS } : null;
}

/** ¿El navegador puede codificar AAC nativamente con WebCodecs? (sí en iOS 26+). */
export async function aacNativeSupported(audio: TimelineAudio): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined') return false;
  try {
    const { supported } = await AudioEncoder.isConfigSupported({
      codec: AAC_CODEC,
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.channels,
      bitrate: AUDIO_BITRATE,
    });
    return !!supported;
  } catch {
    return false;
  }
}

type AddAudioChunk = (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void;

/** Camino nativo: codifica el PCM a AAC con AudioEncoder, entregando chunks al muxer. */
export async function encodeAacNative(audio: TimelineAudio, addChunk: AddAudioChunk): Promise<void> {
  const { planar, sampleRate, channels } = audio;
  const totalSamples = planar[0].length;

  const encoder = new AudioEncoder({
    output: (chunk, meta) => addChunk(chunk, meta),
    error: (e) => {
      throw e;
    },
  });
  encoder.configure({
    codec: AAC_CODEC,
    sampleRate,
    numberOfChannels: channels,
    bitrate: AUDIO_BITRATE,
  });

  const BLOCK = 1024; // frames por AudioData
  for (let offset = 0; offset < totalSamples; offset += BLOCK) {
    const frames = Math.min(BLOCK, totalSamples - offset);
    const data = new Float32Array(frames * channels); // planar: [ch0…][ch1…]
    for (let ch = 0; ch < channels; ch++) {
      data.set(planar[ch].subarray(offset, offset + frames), ch * frames);
    }
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data,
    });
    encoder.encode(audioData);
    audioData.close();

    while (encoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 1));
    }
  }

  await encoder.flush();
  encoder.close();
}

/** Serializa el PCM de la timeline a WAV PCM 16-bit (entrada del fallback ffmpeg). */
export function encodeWav(audio: TimelineAudio): Uint8Array {
  const { planar, sampleRate, channels } = audio;
  const frames = planar[0].length;
  const dataLen = frames * channels * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  dv.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * channels * 2, true); // byte rate
  dv.setUint16(32, channels * 2, true); // block align
  dv.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  dv.setUint32(40, dataLen, true);

  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const s = Math.max(-1, Math.min(1, planar[ch][i]));
      dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Uint8Array(buf);
}
