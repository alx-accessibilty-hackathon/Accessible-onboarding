import { del, get } from 'idb-keyval';
import { errorCode, type ApiConfig } from '../api/client';
import { transcribe } from '../api/speech';
import type { Step } from '../engine/types';
import { widgetStore } from '../offline/db';
import { normalizeVoiceInput } from './normalize';

export type ClipResult = { text: string } | { code: string };

/**
 * Path B (section 3.2): send a clip recorded on this phone to POST /speech/transcriptions and
 * clean the text up for the field. The clip is deleted once it has been turned into text.
 */
export async function transcribeClip(
  cfg: ApiConfig,
  clipId: string,
  step: Step,
  lang: string,
): Promise<ClipResult> {
  const blob = await get<Blob>(clipId, widgetStore()).catch(() => undefined);
  if (!blob) return { code: 'speech_unavailable' };
  try {
    const res = await transcribe(cfg, blob, {
      language: lang,
      stepId: step.id,
      fieldType: step.type,
    });
    void del(clipId, widgetStore()).catch(() => {});
    const clean = normalizeVoiceInput(res.transcript, step, lang);
    const text = Array.isArray(clean) ? clean.join(', ') : clean;
    return text ? { text } : { code: 'speech_unclear' };
  } catch (err) {
    return { code: errorCode(err) };
  }
}
