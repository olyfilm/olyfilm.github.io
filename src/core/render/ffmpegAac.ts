import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
// Vite emite estos assets y nos da sus URLs servidas (no se commitean al repo).
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

// Fallback de audio para navegadores SIN AAC nativo (Linux/Firefox de dev, iOS < 26).
// Este módulo se importa de forma dinámica, así Vite lo separa en su propio chunk y
// el core de ~31 MB NUNCA se descarga en el target (iPhone 17+ usa el AAC nativo).

let ffmpegPromise: Promise<FFmpeg> | null = null;

async function getFfmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(coreURL, 'text/javascript'),
        wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
      });
      return ffmpeg;
    })();
  }
  const ffmpeg = await ffmpegPromise;
  if (onLog) {
    ffmpeg.on('log', ({ message }) => onLog(message));
  }
  return ffmpeg;
}

/**
 * Toma el MP4 sólo-video (de WebCodecs) y un WAV, y produce un MP4 con audio AAC.
 * El video se copia sin re-codificar (`-c:v copy`); ffmpeg sólo codifica el audio,
 * por lo que es liviano en memoria comparado con un transcode completo.
 */
export async function muxAacWithFfmpeg(
  videoMp4: Blob,
  wav: Uint8Array,
  onLog?: (msg: string) => void,
): Promise<Blob> {
  const ffmpeg = await getFfmpeg(onLog);
  await ffmpeg.writeFile('v.mp4', new Uint8Array(await videoMp4.arrayBuffer()));
  await ffmpeg.writeFile('a.wav', wav);
  await ffmpeg.exec([
    '-i', 'v.mp4',
    '-i', 'a.wav',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    'out.mp4',
  ]);
  const data = await ffmpeg.readFile('out.mp4');
  await ffmpeg.deleteFile('v.mp4');
  await ffmpeg.deleteFile('a.wav');
  await ffmpeg.deleteFile('out.mp4');
  return new Blob([data as Uint8Array], { type: 'video/mp4' });
}
