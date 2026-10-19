import type { SubtitleCue } from '@/shared/types';

// Transcripción local con Whisper (transformers.js / WebGPU). Esqueleto para H4.
// No gasta tokens de API. Fallback: Web Speech API.

export interface TranscribeOptions {
  model: 'base' | 'small';
  language: string;
}

export interface Transcriber {
  transcribe(audio: Blob, opts: TranscribeOptions): Promise<SubtitleCue[]>;
}

// TODO (H4): cargar modelo Whisper, cachear, devolver cues con timestamps.
