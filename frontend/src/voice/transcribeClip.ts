import { del, get } from 'idb-keyval';
import { errorCode, type ApiConfig } from '../api/client';
import { transcribe } from '../api/speech';
import type { Step } from '../engine/types';
import { widgetStore } from '../offline/db';
import { normalizeVoiceInput } from './normalize';
import { syncCloudConsent } from './serverSpeech';

/** `raw` is exactly what the service heard; `provider` "mock" is the server's test service. */
export type ClipResult = { text: string; raw: string; provider: string } | { code: string };

/**
 * Path B (section 3.2): send a clip recorded on this phone to POST /speech/transcriptions and
 * clean the text up for the field. The clip is deleted from the phone after this one try,
 * whether it worked or not: nothing tries it again later, so we don't keep recordings.
 */
export async function transcribeClip(
  cfg: ApiConfig,
  clipId: string,
  step: Step,
  lang: string,
  registrationId?: string,
): Promise<ClipResult> {
  const blob = await get<Blob>(clipId, widgetStore()).catch(() => undefined);
  if (!blob) return { code: 'speech_unavailable' };
  try {
    // The server's cloud service (Addis AI) needs the learner's "yes", recorded on the server.
    await syncCloudConsent(cfg, registrationId);
    const res = await transcribe(cfg, blob, {
      language: lang,
      stepId: step.id,
      fieldType: step.type,
    });
    const raw = (res.transcript ?? '').trim();
    const clean = normalizeVoiceInput(raw, step, lang);
    const text = Array.isArray(clean) ? clean.join(', ') : clean;
    return text ? { text, raw, provider: res.provider ?? '' } : { code: 'speech_unclear' };
  } catch (err) {
    return { code: errorCode(err) };
  } finally {
    void del(clipId, widgetStore()).catch(() => {});
  }
}
