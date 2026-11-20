// Read Aloud mode: say the element the person moves to (its on-screen name, role and state)
// and what they select. Names are read from the page as it is shown; text the learner typed
// (field contents, anything under [data-bo-private]) is personal and stays on the device.
// Elements focused by the widget itself (tabindex="-1": headings, the error summary) are not
// described: the screen reading or the error reading already says them.
//
// When the person moves focus themselves (Tab, the arrow keys, a tap), what they land on is
// said at once, cutting off whatever was being read (also the first reading of the page). The
// key press or tap that starts read aloud is the exception: the first reading is said first.
// When the widget moves focus (e.g. after a voice answer), the new place is said after what is
// being said now, never over it.
//
// On focus, a field also says its hint and error and what to do ("Type your answer, then press
// Enter."); a list or group of options says how to choose.
//
// Choices are read as a whole when focus comes into them: a radio or checkbox group (a
// fieldset, role="radiogroup"/"group") or a set of toggle buttons in a role="group" (the
// calendar choice of a date): the question, "N options:", every option, what is selected now,
// and the focused option with its state. A list (<select>) says how many options it has and
// what is chosen, not every option. Moving between the options of the same group says only
// the focused option and its state.

import { useEffect, type RefObject } from 'react';
import { t } from '../i18n/t';
import { getSpeakerState, speak, type SpeakOptions, type SpeechPart } from './speaker';

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
    if (segs.length) return merge(segs);
  }
  const parentLabel = el.closest('label');
  if (parentLabel) {
    textSegments(parentLabel, langOf(parentLabel, uiLang), segs, true);
    if (segs.length) return merge(segs);
  }
  textSegments(el, langOf(el, uiLang), segs, false);
  if (!segs.length) {
    const title = el.getAttribute('title') ?? el.getAttribute('placeholder');
    if (title) segs.push({ text: title, lang: langOf(el, uiLang) });
  }
  return merge(segs);
}

/** The hint and error a field points to (aria-describedby): fixed interface text. */
function describedBySegments(el: Element, uiLang: string): Seg[] {
  const ids = el.getAttribute('aria-describedby');
  if (!ids) return [];
  const root = el.getRootNode() as Document | ShadowRoot;
  const segs: Seg[] = [];
  for (const id of ids.split(/\s+/)) {
    const target = id ? root.getElementById?.(id) : null;
    if (target) textSegments(target, langOf(target, uiLang), segs, false);
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

/** What to do here, set by the page on any element (already in the page's language). */
function ownInstruction(el: Element, uiLang: string): SpeechPart[] {
  const text = el.getAttribute('data-bo-instruction');
  return text ? [{ text, lang: langOf(el, uiLang) }] : [];
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

/** How to choose in a group of this kind (said when focus comes into it). */
function groupHint(group: OptionGroup, lang: string): SpeechPart[] {
  if (group.kind === 'checkbox') return [word(lang, 'speech.hint.checkbox')];
  if (group.kind === 'radio' || group.kind === 'select') return [word(lang, 'speech.hint.arrows')];
  return [];
}

/**
 * Coming into a group: the question, every option (a list: how many), what is chosen, then
 * the focused one, and how to choose.
 */
function describeGroup(group: OptionGroup, el: Element, uiLang: string): SpeechPart[] {
  const lang = langOf(el, uiLang);
  const personal = !!el.closest('[data-bo-private]');
  const parts: SpeechPart[] = [...toParts(groupLabel(group, uiLang), false)];
  if (group.kind === 'select') parts.push(word(lang, 'speech.role.list'));
  parts.push(word(lang, 'speech.n_options', { n: group.options.length }));
  // A list (e.g. the 13 months) is not read out option by option: the arrow keys say each one.
  if (group.kind !== 'select') {
    for (const option of group.options) parts.push(...optionName(option, uiLang, personal));
  }

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
  parts.push(...toParts(describedBySegments(el, uiLang), false));
  parts.push(...groupHint(group, lang));
  return parts;
}

/**
 * One control: its name, role and state. On focus (`focus`), also its hint and error and what
 * to do there; under the pointer, a block of text is read as it is.
 */
function controlParts(el: Element, uiLang: string, focus: boolean): SpeechPart[] {
  const lang = langOf(el, uiLang);
  const personal = !!el.closest('[data-bo-private]');
  const name = toParts(nameSegments(el, uiLang), personal);
  const tag = el.tagName;
  const type = (el.getAttribute('type') ?? '').toLowerCase();
  const disabled = (el as HTMLButtonElement).disabled === true;
  const parts: SpeechPart[] = [];
  const hints: SpeechPart[] = []; // said last, and only on focus

  if (tag === 'INPUT' && type === 'radio') {
    const input = el as HTMLInputElement;
    const root = el.getRootNode() as Document | ShadowRoot;
    const groupName = input.name.replace(/["\\]/g, '\\$&');
    const radios = Array.from(
      root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${groupName}"]`),
    );
    parts.push(...name);
    if (radios.length > 1) {
      parts.push(
        word(lang, 'speech.role.option', {
          n: Math.max(1, radios.indexOf(input) + 1),
          total: radios.length,
        }),
      );
    }
    parts.push(word(lang, input.checked ? 'speech.state.selected' : 'speech.state.not_selected'));
    hints.push(word(lang, 'speech.hint.arrows'));
  } else if (tag === 'INPUT' && type === 'checkbox') {
    parts.push(...name);
    parts.push(word(lang, 'speech.role.checkbox'));
    parts.push(
      word(
        lang,
        (el as HTMLInputElement).checked ? 'speech.state.checked' : 'speech.state.not_checked',
      ),
    );
    hints.push(...toParts(describedBySegments(el, uiLang), false));
    hints.push(word(lang, 'speech.hint.checkbox'));
  } else if (tag === 'INPUT' && type === 'file') {
    parts.push(...name);
    parts.push(word(lang, 'speech.role.file'));
    hints.push(...toParts(describedBySegments(el, uiLang), false));
    hints.push(word(lang, 'speech.hint.file'));
  } else if (tag === 'INPUT' || tag === 'TEXTAREA') {
    const value = (el as HTMLInputElement).value.trim();
    parts.push(...name);
    parts.push(word(lang, tag === 'TEXTAREA' ? 'speech.role.text_area' : 'speech.role.text_field'));
    if (value) {
      parts.push(word(lang, 'speech.state.has_text'));
      // What the learner typed: device voice only, and nothing if there is none.
      parts.push({ text: value, lang, personal: true });
    } else {
      parts.push(word(lang, 'speech.state.empty'));
    }
    hints.push(...toParts(describedBySegments(el, uiLang), false));
    hints.push(word(lang, tag === 'TEXTAREA' ? 'speech.hint.type_long' : 'speech.hint.type'));
  } else if (tag === 'SELECT') {
    const select = el as HTMLSelectElement;
    const option = select.selectedOptions?.[0];
    parts.push(...name);
    parts.push(word(lang, 'speech.role.list'));
    // What the learner picked (e.g. the month they were born): device voice only.
    if (option?.value && option.textContent) {
      parts.push({ text: option.textContent.trim(), lang, personal: true });
    }
    hints.push(word(lang, 'speech.hint.arrows'));
  } else if (tag === 'A') {
    parts.push(...name);
    parts.push(word(lang, 'speech.role.link'));
  } else if (tag === 'BUTTON' || el.getAttribute('role') === 'button') {
    parts.push(...name);
    parts.push(word(lang, 'speech.role.button'));
    const pressed = el.getAttribute('aria-pressed');
    if (pressed === 'true') parts.push(word(lang, 'speech.state.on'));
    if (pressed === 'false') parts.push(word(lang, 'speech.state.off'));
    const expanded = el.getAttribute('aria-expanded');
    if (expanded === 'true') parts.push(word(lang, 'speech.state.expanded'));
    if (expanded === 'false') {
      parts.push(word(lang, 'speech.state.collapsed'));
      hints.push(word(lang, 'speech.hint.open'));
    }
  } else if (focus) {
    parts.push(...name);
  } else {
    // Non-control readable element (headings, paragraphs, banners, alerts, badges, labels)
    const read = readableText(el, uiLang);
    parts.push(...(read.length ? read : name));
  }

  if (disabled) parts.push(word(lang, 'speech.state.unavailable'));
  if (!focus || disabled) return parts;
  return [...parts, ...hints, ...ownInstruction(el, uiLang)];
}

/** What to say when `el` gets focus (null: say nothing). */
export function describeFocus(el: Element, uiLang: string, from: Element | null): SpeechPart[] {
  if (el.getAttribute('tabindex') === '-1' || el.tagName === 'DIALOG') return [];
  const lang = langOf(el, uiLang);
  const personal = !!el.closest('[data-bo-private]');
  const parts: SpeechPart[] = [];

  // Entering a group (e.g. a job card, a date): say what it is about first.
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

  parts.push(...controlParts(el, uiLang, true));
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

/** Describe the element under the pointer (or any element): name, role and state. */
export function describeElement(el: Element, uiLang: string): SpeechPart[] {
  if (el.tagName === 'DIALOG') return [];
  const lang = langOf(el, uiLang);
  const personal = !!el.closest('[data-bo-private]');

  // An option in a group: describe THIS option directly (its name + state).
  const options = optionGroup(el);
  if (options) {
    if (options.kind === 'select') return controlParts(el, uiLang, false);
    const parts = [...toParts(nameSegments(el, uiLang), personal), optionState(options, el, lang)];
    if ((el as HTMLButtonElement).disabled === true) {
      parts.push(word(lang, 'speech.state.unavailable'));
    }
    return parts;
  }
  return controlParts(el, uiLang, false);
}

/** Find the meaningful interactive control or readable text element under `target`. */
export function findReadableTarget(target: Element | null, root: HTMLElement): Element | null {
  if (!target || target === root || target.tagName === 'DIALOG') return null;

  // 1. Check if inside an interactive control or label
  const control = target.closest(
    'button, a, input, select, textarea, [role="button"], [role="radio"], [role="checkbox"], [role="option"], label',
  );
  if (control && root.contains(control)) {
    if (control.tagName === 'LABEL') {
      const input =
        control.querySelector('input, select, textarea') ||
        (control.getAttribute('for')
          ? (root.getRootNode() as Document | ShadowRoot).getElementById?.(
              control.getAttribute('for')!,
            )
          : null);
      if (input) return input;
    }
    return control;
  }

  // 2. Check if inside a readable block or notice
  const block = target.closest(
    'h1, h2, h3, h4, h5, h6, p, legend, [role="alert"], [role="status"], .bo-banner, dt, dd, summary, pre',
  );
  if (block && root.contains(block)) return block;

  // 3. Leaf text element
  if (target.children.length === 0 && target.textContent?.trim() && root.contains(target)) {
    return target;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Who moved focus: the person (Tab, arrows, a tap) or the widget     */
/* ------------------------------------------------------------------ */

// Keys that move focus by themselves (in a group of options, the arrows move it too).
const HOVER_OWNER = 'hover';
const MOVE_KEYS = new Set([
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
]);
const RECENT_MS = 600;

interface LastInput {
  at: number;
  key: string | null; // the key pressed, or null for a pointer
  target: EventTarget | null; // where the pointer went down (inside the shadow root too)
  /** This input is the one that started read aloud (the first key press or tap). */
  activating: boolean;
}

let lastInput: LastInput = { at: 0, key: null, target: null, activating: false };
let inputListeners = 0;

// Window, capture phase: runs before the speaker's first-gesture listener (on the document),
// so `activating` is still known. Passive: nothing on the host page is changed or blocked.
function onUserInput(e: Event): void {
  lastInput = {
    at: Date.now(),
    key: e instanceof KeyboardEvent ? e.key : null,
    target: e.composedPath?.()[0] ?? e.target,
    activating: !getSpeakerState().activated,
  };
}

const INPUT_LISTEN = { capture: true, passive: true } as const;

function watchUserInput(): () => void {
  if (inputListeners++ === 0) {
    window.addEventListener('keydown', onUserInput, INPUT_LISTEN);
    window.addEventListener('pointerdown', onUserInput, INPUT_LISTEN);
  }
  return () => {
    if (--inputListeners === 0) {
      window.removeEventListener('keydown', onUserInput, INPUT_LISTEN);
      window.removeEventListener('pointerdown', onUserInput, INPUT_LISTEN);
    }
  };
}

/** The pointer went down on `el`, inside it, or on its label (a choice card, a question). */
function pointerOn(el: Element, target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  if (el === target || el.contains(target)) return true;
  const start = target instanceof Element ? target : target.parentElement;
  const label = start?.closest('label');
  if (!label) return false;
  const labels = (el as HTMLInputElement).labels;
  return label.contains(el) || (!!labels && Array.from(labels).includes(label));
}

/** How to say what got focus: at once (the person moved), or after what is being said. */
function focusSpeakOptions(el: Element): SpeakOptions {
  const recent = Date.now() - lastInput.at < RECENT_MS;
  const byPerson =
    recent &&
    (lastInput.key !== null ? MOVE_KEYS.has(lastInput.key) : pointerOn(el, lastInput.target));
  if (!byPerson) return { low: true, after: true }; // the widget moved focus
  // The key press or tap that started read aloud: the first reading goes first.
  if (lastInput.activating) return { low: true };
  return { interrupt: true };
}

/** Listen for focus, hover and choices inside the widget while Read Aloud mode is on. */
export function useFocusSpeech(
  rootRef: RefObject<HTMLElement>,
  lang: string,
  enabled: boolean,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    const unwatch = watchUserInput();

    let hoverTimer: number | undefined;
    let lastHovered: Element | null = null;

    const onPointerOver = (e: Event) => {
      const rawTarget = e.target as Element | null;
      if (!rawTarget) return;
      const target = findReadableTarget(rawTarget, root);
      if (!target || target === lastHovered) return;

      window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => {
        lastHovered = target;
        const parts = describeElement(target, lang);
        if (!parts.length) return;
        // Moving the pointer replaces what the pointer said before, but never cuts off a
        // reading (a screen, "We heard: …"): the page can also move under a still pointer.
        const { speaking, owner } = getSpeakerState();
        const busy = speaking && owner !== HOVER_OWNER;
        void speak(parts, lang, { low: true, owner: HOVER_OWNER, after: busy });
      }, 100);
    };

    const onPointerLeave = (e: Event) => {
      if (e.target === root) {
        window.clearTimeout(hoverTimer);
        lastHovered = null;
      }
    };

    const onFocus = (e: Event) => {
      const el = e.target as Element | null;
      if (!el || el === root) return;
      window.clearTimeout(hoverTimer);
      lastHovered = el;
      const from = (e as FocusEvent).relatedTarget as Element | null;
      const parts = describeFocus(el, lang, from);
      if (parts.length) void speak(parts, lang, focusSpeakOptions(el));
    };

    const onChange = (e: Event) => {
      const el = e.target as Element | null;
      if (!el) return;
      window.clearTimeout(hoverTimer);
      lastHovered = null;
      const parts = describeChange(el, lang);
      if (parts.length) void speak(parts, lang, { low: true });
    };
    // A toggle button (e.g. "Simple mode", "Read aloud" or group button like "Ethiopian
    // calendar") or a button that opens a panel: say what is selected/toggled/open, once the
    // DOM state updates. (Never while the microphone listens: it would become the answer.)
    let timer: number | undefined;
    const onClick = (e: Event) => {
      window.clearTimeout(hoverTimer);
      lastHovered = null;
      const button = (e.target as Element | null)?.closest?.(
        'button[aria-pressed], button[aria-expanded]',
      );
      if (!button) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!button.isConnected) return;
        const personal = !!button.closest('[data-bo-private]');
        const btnLang = langOf(button, lang);
        const name = toParts(nameSegments(button, lang), personal);
        const expanded = button.getAttribute('aria-expanded');
        if (expanded !== null) {
          const stateWord = word(
            btnLang,
            expanded === 'true' ? 'speech.state.expanded' : 'speech.state.collapsed',
          );
          void speak([...name, stateWord], lang, { interrupt: true });
          return;
        }
        const pressed = button.getAttribute('aria-pressed');
        const inGroup = !!button.closest('[role="group"]');
        if (inGroup) {
          if (pressed !== 'true') return;
          void speak([word(btnLang, 'speech.selected_prefix'), ...name], lang, { low: true });
        } else {
          // Standalone toggle button (e.g. "Simple mode", "Read aloud", "Answer by speaking")
          const stateWord =
            pressed === 'true'
              ? word(btnLang, 'speech.state.on')
              : word(btnLang, 'speech.state.off');
          void speak([...name, stateWord], lang, { interrupt: true });
        }
      }, 50);
    };

    root.addEventListener('pointerover', onPointerOver);
    root.addEventListener('mouseover', onPointerOver);
    root.addEventListener('pointerleave', onPointerLeave);
    root.addEventListener('mouseleave', onPointerLeave);
    root.addEventListener('focusin', onFocus);
    root.addEventListener('change', onChange);
    root.addEventListener('click', onClick);

    return () => {
      unwatch();
      window.clearTimeout(hoverTimer);
      window.clearTimeout(timer);
      root.removeEventListener('pointerover', onPointerOver);
      root.removeEventListener('mouseover', onPointerOver);
      root.removeEventListener('pointerleave', onPointerLeave);
      root.removeEventListener('mouseleave', onPointerLeave);
      root.removeEventListener('focusin', onFocus);
      root.removeEventListener('change', onChange);
      root.removeEventListener('click', onClick);
    };
  }, [rootRef, lang, enabled]);
}
