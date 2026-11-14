// Speech-to-text API (FB-6 / FE-B). Sends audio as FormData.

import { apiFetch, type ApiConfig } from './client';

/**
 * Transcribe an audio blob via the backend STT endpoint.
 * The blob is sent as multipart/form-data so `apiFetch` skips the
 * Content-Type header and lets the browser set the boundary.
 */
export async function transcribe(
  cfg: ApiConfig,
  audioBlob: Blob,
  lang: string,
): Promise<{ text: string; confidence: number }> {
  const form = new FormData();
  form.append('audio', audioBlob, 'recording.webm');
  form.append('lang', lang);

  return apiFetch<{ text: string; confidence: number }>(cfg, '/speech/transcribe', {
    method: 'POST',
    body: form,
    // Give transcription a longer timeout than the default 15 s
    signal: AbortSignal.timeout(30_000),
  });
}
