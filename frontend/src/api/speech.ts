// Speech-to-text API (FB-6 / FE-B). Sends audio as FormData (speech_dto.go).

import { ApiError, apiFetch, apiUrl, type ApiConfig } from './client';

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

/**
 * Read FIXED interface text aloud with the server's voice: POST /speech/synthesis (partner key
 * only) returns MP3 audio. Never send what the learner typed or said (requirement Q2).
 * 503 speech_unavailable when no voice is set up for the language.
 */
export async function synthesize(cfg: ApiConfig, text: string, language: string): Promise<Blob> {
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'audio/mpeg' });
  if (cfg.partnerKey) headers.set('X-Partner-Key', cfg.partnerKey);
  let res: Response;
  try {
    res = await fetch(apiUrl(cfg.origin, '/speech/synthesis'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, language }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('audio')) {
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    throw new ApiError(res.status, body.code ?? 'speech_unavailable');
  }
  return res.blob();
}
