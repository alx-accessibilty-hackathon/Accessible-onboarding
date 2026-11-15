// What a screen says in Read aloud mode (and when Listen is pressed). Fixed interface text
// (titles, hints, option labels) may use any voice; the learner's own answers are `personal`
// and stay on the device (a11y/speaker.ts).

import { resolveOptions, type OptionContext } from '../engine/options';
import type { Step } from '../engine/types';
import { isCodeStep, isValueEmpty } from '../engine/validate';
import { t } from '../i18n/t';
import { ETHIOPIAN_MONTHS, GREGORIAN_MONTHS, type DateAnswerValue } from '../lib/ethiopianCalendar';
import type { Part, SpeechPart } from './speaker';

/** A language-file string, said as one part (a recorded clip of it may exist). */
export function keyPart(lang: string, key: string): SpeechPart {
  return { text: t(lang, key), key };
}

/** "4821" → "4 8 2 1", so a voice says each digit. */
export function spellDigits(text: string): string {
  return text.replace(/\d/g, '$& ').replace(/\s+/g, ' ').trim();
}

/** "AB12" → "A B 1 2": a code (the last 4 letters or numbers of a document), one by one. */
export function spellCode(text: string): string {
  return text.replace(/\s+/g, '').split('').join(' ');
}

/** The options of a choice step as they are shown (language-file text or a partner's name). */
export function optionLabels(step: Step, lang: string, ctx?: OptionContext): SpeechPart[] {
  return resolveOptions(step, ctx).map((o) =>
    o.literal ? { text: o.label, lang: o.lang } : { text: t(lang, o.label), key: o.label },
  );
}

/** A date as people say it: "15 Meskerem 2010" (Ethiopian) or "25 September 2017". */
export function formatDate(
  value: DateAnswerValue & { entered?: Record<string, string> },
  lang: string,
): string {
  if (!value.iso) {
    const e = value.entered ?? {};
    return [e.day, e.month, e.year].filter(Boolean).join(' ');
  }
  if (value.calendar === 'ethiopian' && value.ethiopian) {
    const { day, month, year } = value.ethiopian;
    const m = ETHIOPIAN_MONTHS.find((x) => x.id === month);
    return `${day} ${m ? (lang === 'am' ? m.nameAm : m.nameEn) : month} ${year}`;
  }
  const [y, mo, d] = value.iso.split('-').map(Number);
  const m = GREGORIAN_MONTHS.find((x) => x.id === mo);
  return `${d} ${m ? (lang === 'am' ? m.nameAm : m.nameEn) : mo} ${y}`;
}

/**
 * An answer, said aloud. Chosen options are fixed text; anything the learner typed or said is
 * personal: device voice only, else `fallbackKey` ("Your answer is in the box").
 */
export function answerParts(
  step: Step,
  value: unknown,
  lang: string,
  ctx: OptionContext | undefined,
  fallbackKey: string,
): Part[] {
  if (isValueEmpty(value)) return [];
  if (typeof value === 'boolean') return [keyPart(lang, value ? 'common.yes' : 'common.no')];
  if (step.type === 'single_choice' || step.type === 'multi_choice') {
    const labels = optionLabels(step, lang, ctx);
    const values = resolveOptions(step, ctx).map((o) => o.value);
    const chosen = Array.isArray(value) ? value.map(String) : [String(value)];
    return chosen.map((v) => labels[values.indexOf(v)] ?? { text: v, personal: true, fallbackKey });
  }
  let text: string;
  if (step.type === 'date' && typeof value === 'object' && value && 'iso' in value) {
    text = formatDate(value as DateAnswerValue, lang);
  } else {
    text = String(value);
    if (step.type === 'phone' || step.type === 'digits') text = spellDigits(text);
    else if (isCodeStep(step)) text = spellCode(text);
  }
  return [{ text, personal: true, fallbackKey }];
}

/** A question screen: progress, question, hint, the options, then the current answer. */
export function stepParts(
  step: Step,
  lang: string,
  value: unknown,
  opts: { ctx?: OptionContext; progress?: string; sayNow?: boolean } = {},
): Part[] {
  const parts: Part[] = [];
  if (opts.progress) parts.push(opts.progress);
  parts.push(keyPart(lang, step.title));
  if (step.hint) parts.push(keyPart(lang, step.hint));

  if (step.type === 'single_choice' || step.type === 'multi_choice') {
    const labels = optionLabels(step, lang, opts.ctx);
    if (labels.length > 0) parts.push(keyPart(lang, 'speech.options'), ...labels);
    else if (step.options_from === 'config:referral_partners') {
      parts.push(keyPart(lang, 'signup.referral_partner.empty'));
    } else parts.push(keyPart(lang, 'errors.options_unavailable'));
    const chosen = answerParts(step, value, lang, opts.ctx, 'speech.answer_in_box');
    if (chosen.length > 0) parts.push(keyPart(lang, 'speech.selected_prefix'), ...chosen);
  } else if (step.type === 'consent') {
    parts.push(
      keyPart(lang, 'consent.agree'),
      keyPart(lang, 'speech.role.checkbox'),
      keyPart(lang, value === true ? 'speech.state.checked' : 'speech.state.not_checked'),
    );
  } else if (step.type !== 'info') {
    const answer = answerParts(step, value, lang, opts.ctx, 'speech.answer_in_box');
    if (answer.length > 0) parts.push(keyPart(lang, 'speech.your_answer'), ...answer);
  }
  if (opts.sayNow) parts.push(keyPart(lang, 'voice.say_now'));
  return parts;
}
