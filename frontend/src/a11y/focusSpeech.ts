// Read Aloud mode: say the element the person moves to (its on-screen name, role and state)
// and what they select. Names are read from the page as it is shown; text the learner typed
// (field contents, anything under [data-bo-private]) is personal and stays on the device.
// Elements focused by the widget itself (tabindex="-1": headings, the error summary) are not
// described: the screen reading or the error reading already says them.
//
// Choices are read as a whole when focus comes into them: a radio or checkbox group (a
// fieldset, role="radiogroup"/"group"), a list (<select>) or a set of toggle buttons in a
// role="group" (the calendar choice of a date). Then: the question, "N options:", every option,
// what is selected now, and the focused option with its state. Moving between the options of
// the same group says only the focused option and its state.

import { useEffect, type RefObject } from 'react';
import { t } from '../i18n/t';
import { speak, type SpeechPart } from './speaker';

interface Seg {
  text: string;
  lang: string;
}

const CONTROLS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);

function langOf(el: Element | null, fallback: string): string {
  return el?.closest('[lang]')?.getAttribute('lang') || fallback;
}

/** The visible and screen-reader text under `node`, split where the language changes. */
function textSegments(node: Node, lang: string, out: Seg[], skipControls: boolean): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (text.trim()) out.push({ text, lang });
    return;
  }
  if (!(node instanceof Element)) return;
  if (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('hidden')) return;
  if (skipControls && CONTROLS.has(node.tagName)) return;
  const own = node.getAttribute('lang') || lang;
  node.childNodes.forEach((child) => textSegments(child, own, out, skipControls));
}

function merge(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.lang === s.lang) last.text = `${last.text} ${s.text}`;
    else out.push({ ...s });
  }
  return out.map((s) => ({ ...s, text: s.text.replace(/\s+/g, ' ').trim() })).filter((s) => s.text);
}

/** All the readable text under `node`, in pieces by language (for a plain page's reading). */
export function readableText(node: Element, uiLang: string): SpeechPart[] {
  const segs: Seg[] = [];
  textSegments(node, langOf(node, uiLang), segs, false);
  return merge(segs).map((s) => ({ text: s.text, lang: s.lang }));
}

function nameSegments(el: Element, uiLang: string): Seg[] {
  const root = el.getRootNode() as Document | ShadowRoot;
  const segs: Seg[] = [];
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const target = root.getElementById?.(id);
      if (target) textSegments(target, langOf(target, uiLang), segs, false);
    }
    if (segs.length) return merge(segs);
  }
  const label = el.getAttribute('aria-label');
  if (label) return [{ text: label, lang: langOf(el, uiLang) }];
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length > 0) {
    labels.forEach((l) => textSegments(l, langOf(l, uiLang), segs, true));
    return merge(segs);
  }
  textSegments(el, langOf(el, uiLang), segs, false);
  if (!segs.length) {
    const title = el.getAttribute('title') ?? el.getAttribute('placeholder');
    if (title) segs.push({ text: title, lang: langOf(el, uiLang) });
  }
  return merge(segs);
}

function toParts(segs: Seg[], personal: boolean): SpeechPart[] {
  return segs.map((s) => ({ text: s.text, lang: s.lang, personal }));
}

/** A fixed word ("button", "selected") in the element's language, said in that language. */
function word(lang: string, key: string, params?: Record<string, string | number>): SpeechPart {
  const text = t(lang, key, params);
  return params ? { text, lang } : { text, key, lang };
}

/* ------------------------------------------------------------------ */
/*  Groups of options                                                  */
/* ------------------------------------------------------------------ */

interface OptionGroup {
  kind: 'radio' | 'checkbox' | 'toggle' | 'select';
  /** The element that holds the options (the select itself for a list). */
  box: Element;
  options: Element[];
}

const GROUP_SELECTOR = 'fieldset, [role="radiogroup"], [role="group"]';

function optionGroup(el: Element): OptionGroup | null {
  const tag = el.tagName;
  const type = (el.getAttribute('type') ?? '').toLowerCase();
  if (tag === 'SELECT') {
    const options = Array.from((el as HTMLSelectElement).options).filter((o) => o.value !== '');
    return options.length > 0 ? { kind: 'select', box: el, options } : null;
  }
  if (tag === 'INPUT' && (type === 'radio' || type === 'checkbox')) {
    const box = el.closest(GROUP_SELECTOR);
    let options: Element[];
    if (box) {
      options = Array.from(box.querySelectorAll(`input[type="${type}"]`));
    } else if (type === 'radio' && (el as HTMLInputElement).name) {
      const root = el.getRootNode() as Document | ShadowRoot;
      const name = (el as HTMLInputElement).name.replace(/["\\]/g, '\\$&');
      options = Array.from(root.querySelectorAll(`input[type="radio"][name="${name}"]`));
    } else {
      return null;
    }
    if (options.length < 2) return null;
    return { kind: type as 'radio' | 'checkbox', box: box ?? el, options };
  }
  if (tag === 'BUTTON' && el.hasAttribute('aria-pressed')) {
    const box = el.closest('[role="group"]');
    if (!box) return null;
    const options = Array.from(box.querySelectorAll('button[aria-pressed]'));
    return options.length >= 2 ? { kind: 'toggle', box, options } : null;
  }
  return null;
}

/** The question a group answers: its own label, else the legend of its fieldset. */
function groupLabel(group: OptionGroup, uiLang: string): Seg[] {
  if (group.kind === 'select') return nameSegments(group.box, uiLang);
  const root = group.box.getRootNode() as Document | ShadowRoot;
  const segs: Seg[] = [];
  const labelledBy = group.box.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const target = root.getElementById?.(id);
      if (target) textSegments(target, langOf(target, uiLang), segs, false);
    }
    if (segs.length) return merge(segs);
  }
  const label = group.box.getAttribute('aria-label');
  if (label) return [{ text: label, lang: langOf(group.box, uiLang) }];
  const fieldset = group.box.closest('fieldset');
  const legend = fieldset
    ? Array.from(fieldset.children).find((c) => c.tagName === 'LEGEND')
    : null;
  if (legend) textSegments(legend, langOf(legend, uiLang), segs, false);
  return merge(segs);
}

function isOn(option: Element): boolean {
  if (option instanceof HTMLOptionElement) return option.selected;
  if (option.tagName === 'BUTTON') return option.getAttribute('aria-pressed') === 'true';
  return (option as HTMLInputElement).checked === true;
}

function optionName(option: Element, uiLang: string, personal: boolean): SpeechPart[] {
  if (option instanceof HTMLOptionElement) {
    return [{ text: option.textContent?.trim() ?? '', lang: langOf(option, uiLang), personal }];
  }
  return toParts(nameSegments(option, uiLang), personal);
}

/** The focused option and its state ("English, selected"). */
function optionState(group: OptionGroup, el: Element, lang: string): SpeechPart {
  if (group.kind === 'checkbox') {
    return word(lang, isOn(el) ? 'speech.state.checked' : 'speech.state.not_checked');
  }
  return word(lang, isOn(el) ? 'speech.state.selected' : 'speech.state.not_selected');
}

/** Coming into a group: the question, every option, what is chosen, then the focused one. */
function describeGroup(group: OptionGroup, el: Element, uiLang: string): SpeechPart[] {
  const lang = langOf(el, uiLang);
  const personal = !!el.closest('[data-bo-private]');
  const parts: SpeechPart[] = [...toParts(groupLabel(group, uiLang), false)];
  if (group.kind === 'select') parts.push(word(lang, 'speech.role.list'));
  parts.push(word(lang, 'speech.n_options', { n: group.options.length }));
  for (const option of group.options) parts.push(...optionName(option, uiLang, personal));

  const chosen = group.options.filter(isOn);
  // Focus is on the one chosen option: "English, selected" says both at once.
  const focusIsChoice = group.kind !== 'checkbox' && chosen.length === 1 && chosen[0] === el;
  if (chosen.length === 0) {
    parts.push(word(lang, 'speech.nothing_selected'));
  } else if (!focusIsChoice) {
    parts.push(
      word(lang, group.kind === 'checkbox' ? 'speech.checked_prefix' : 'speech.selected_prefix'),
    );
    // The month someone was born is theirs: a chosen list item is said by the device only.
    const mine = personal || group.kind === 'select';
    for (const option of chosen) parts.push(...optionName(option, uiLang, mine));
  }
  if (group.kind !== 'select') {
    parts.push(...toParts(nameSegments(el, uiLang), personal), optionState(group, el, lang));
  }
  return parts;
}

/** What to say when `el` gets focus (null: say nothing). */
export function describeFocus(el: Element, uiLang: string, from: Element | null): SpeechPart[] {
  if (el.getAttribute('tabindex') === '-1' || el.tagName === 'DIALOG') return [];
  const lang = langOf(el, uiLang);
  const personal = !!el.closest('[data-bo-private]');
  const parts: SpeechPart[] = [];

  // Entering a group (e.g. a job card): say what it is about first.
  const group = el.closest('[data-bo-context]');
  if (group && !(from && group.contains(from))) {
    parts.push({ text: group.getAttribute('data-bo-context') ?? '', lang: langOf(group, uiLang) });
  }

  // A group of options: all of it when coming in, only the option when moving inside it.
  const options = optionGroup(el);
  if (options) {
    const inside = !!from && from !== el && options.box.contains(from);
    if (!inside || options.kind === 'select') {
      parts.push(...describeGroup(options, el, uiLang));
    } else {
      parts.push(...toParts(nameSegments(el, uiLang), personal), optionState(options, el, lang));
    }
    if ((el as HTMLButtonElement).disabled === true) {
      parts.push(word(lang, 'speech.state.unavailable'));
    }
    return parts;
  }

  const name = toParts(nameSegments(el, uiLang), personal);
  const tag = el.tagName;
  const type = (el.getAttribute('type') ?? '').toLowerCase();
  const disabled = (el as HTMLButtonElement).disabled === true;

  if (tag === 'INPUT' && type === 'radio') {
    const input = el as HTMLInputElement;
    const root = el.getRootNode() as Document | ShadowRoot;
    const groupName = input.name.replace(/["\\]/g, '\\$&');
    const radios = Array.from(
      root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${groupName}"]`),
    );
    parts.push(...name);
    parts.push(
      word(lang, 'speech.role.option', {
        n: Math.max(1, radios.indexOf(input) + 1),
        total: Math.max(1, radios.length),
      }),
    );
    parts.push(word(lang, input.checked ? 'speech.state.selected' : 'speech.state.not_selected'));
  } else if (tag === 'INPUT' && type === 'checkbox') {
    parts.push(...name);
    parts.push(word(lang, 'speech.role.checkbox'));
    parts.push(
      word(
        lang,
        (el as HTMLInputElement).checked ? 'speech.state.checked' : 'speech.state.not_checked',
      ),
    );
  } else if (tag === 'INPUT' || tag === 'TEXTAREA') {
    const value = (el as HTMLInputElement).value.trim();
    parts.push(...name);
    parts.push(word(lang, 'speech.role.text_field'));
    if (value) {
      parts.push(word(lang, 'speech.state.has_text'));
      // What the learner typed: device voice only, and nothing if there is none.
      parts.push({ text: value, lang, personal: true });
    } else {
      parts.push(word(lang, 'speech.state.empty'));
    }
  } else if (tag === 'SELECT') {
    const select = el as HTMLSelectElement;
    const option = select.selectedOptions?.[0];
    parts.push(...name);
    parts.push(word(lang, 'speech.role.list'));
    // What the learner picked (e.g. the month they were born): device voice only.
    if (option?.value && option.textContent) {
      parts.push({ text: option.textContent.trim(), lang, personal: true });
    }
  } else if (tag === 'A') {
    parts.push(...name);
    parts.push(word(lang, 'speech.role.link'));
  } else if (tag === 'BUTTON' || el.getAttribute('role') === 'button') {
    parts.push(...name);
    parts.push(word(lang, 'speech.role.button'));
    const pressed = el.getAttribute('aria-pressed');
    if (pressed === 'true') parts.push(word(lang, 'speech.state.on'));
    if (pressed === 'false') parts.push(word(lang, 'speech.state.off'));
  } else {
    parts.push(...name);
  }
  if (disabled) parts.push(word(lang, 'speech.state.unavailable'));
  return parts;
}

/** What to say after a choice was made (radio, checkbox, list). Never for typed text. */
export function describeChange(el: Element, uiLang: string): SpeechPart[] {
  const lang = langOf(el, uiLang);
  const personal = !!el.closest('[data-bo-private]');
  const type = (el.getAttribute('type') ?? '').toLowerCase();
  if (el.tagName === 'INPUT' && type === 'radio') {
    if (!(el as HTMLInputElement).checked) return [];
    return [word(lang, 'speech.selected_prefix'), ...toParts(nameSegments(el, uiLang), personal)];
  }
  if (el.tagName === 'INPUT' && type === 'checkbox') {
    const key = (el as HTMLInputElement).checked
      ? 'speech.checked_prefix'
      : 'speech.unchecked_prefix';
    return [word(lang, key), ...toParts(nameSegments(el, uiLang), personal)];
  }
  if (el.tagName === 'SELECT') {
    const option = (el as HTMLSelectElement).selectedOptions?.[0];
    if (!option?.value || !option.textContent) return [];
    return [
      word(lang, 'speech.selected_prefix'),
      { text: option.textContent.trim(), lang, personal: true },
    ];
  }
  return [];
}

/** Listen for focus and choices inside the widget while Read Aloud mode is on. */
export function useFocusSpeech(
  rootRef: RefObject<HTMLElement>,
  lang: string,
  enabled: boolean,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    const onFocus = (e: Event) => {
      const el = e.target as Element | null;
      if (!el || el === root) return;
      const from = (e as FocusEvent).relatedTarget as Element | null;
      const parts = describeFocus(el, lang, from);
      if (parts.length) void speak(parts, lang, { low: true });
    };
    const onChange = (e: Event) => {
      const el = e.target as Element | null;
      if (!el) return;
      const parts = describeChange(el, lang);
      if (parts.length) void speak(parts, lang, { low: true });
    };
    // A toggle button of a group (e.g. "Ethiopian calendar"): say what is selected now, once
    // the screen shows it.
    let timer: number | undefined;
    const onClick = (e: Event) => {
      const button = (e.target as Element | null)?.closest?.('button[aria-pressed]');
      if (!button || !button.closest('[role="group"]')) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (button.getAttribute('aria-pressed') !== 'true') return;
        const personal = !!button.closest('[data-bo-private]');
        const btnLang = langOf(button, lang);
        void speak(
          [
            word(btnLang, 'speech.selected_prefix'),
            ...toParts(nameSegments(button, lang), personal),
          ],
          lang,
          { low: true },
        );
      }, 0);
    };
    root.addEventListener('focusin', onFocus);
    root.addEventListener('change', onChange);
    root.addEventListener('click', onClick);
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener('focusin', onFocus);
      root.removeEventListener('change', onChange);
      root.removeEventListener('click', onClick);
    };
  }, [rootRef, lang, enabled]);
}
