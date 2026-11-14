// Speech-to-text API (FB-6 / FE-B). Sends audio as FormData (speech_dto.go).

import { apiFetch, type ApiConfig } from './client';

export interface Transcription {
  transcript: string;
  confidence: number; // 0..1, or -1 when the provider gives none
  provider: string;
}

/**
 * Transcribe an audio clip via POST /speech/transcriptions (learner token needed).
 * apiFetch skips the Content-Type header for FormData so the browser sets the boundary.
 * 503 speech_unavailable when no provider can do it right now.
 */
export async function transcribe(
  cfg: ApiConfig,
  audioBlob: Blob,
  opts: { language: string; stepId?: string; fieldType?: string },
): Promise<Transcription> {
  const form = new FormData();
  const ext = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
  form.append('audio', audioBlob, `recording.${ext}`);
  form.append('language', opts.language);
  if (opts.stepId) form.append('step_id', opts.stepId);
  if (opts.fieldType) form.append('field_type', opts.fieldType);

  return apiFetch<Transcription>(cfg, '/speech/transcriptions', {
    method: 'POST',
    body: form,
    // Give transcription a longer timeout than the default 15 s
    signal: AbortSignal.timeout(30_000),
  });
}
