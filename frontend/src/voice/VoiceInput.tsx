import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { announce } from '../a11y/announce';
import { useModes } from '../a11y/modes';
import { keyPart } from '../a11y/readParts';
import { getSpeechConsent, setSpeechConsent } from '../a11y/settings';
import { holdSpeech, speak, type Part } from '../a11y/speaker';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { t } from '../i18n/t';
import { useOnline } from '../offline/useOnline';
import { MicHelp } from './MicHelp';
import { matchChoice, normalizeVoiceInput } from './normalize';
import { ReviewCard } from './ReviewCard';
import { SpeechConsent } from './SpeechConsent';
import type { VoiceClipOutcome, VoiceInputProps } from './types';
import { useRecorder } from './useRecorder';
import { useWebSpeech, type SpeechAlternative } from './useWebSpeech';

type VoiceState = 'idle' | 'listening' | 'recording' | 'transcribing' | 'review' | 'heard';

/** What we understood: the value for the field and how to show (and say) it. */
interface Heard {
  value: unknown;
  display: string;
  raw: string; // exactly the words heard
  personal: boolean; // the learner's own words (not an option label)
  mock: boolean; // the server's test voice service: sample text, not what was said
  noMatch: boolean; // single choice: no option matched
  alternatives: Alternative[];
}

interface Alternative {
  value: unknown;
  display: string;
}

type Focusable = 'stop' | 'keep' | 'sayAgain' | 'voice';

const UNSURE = 0.75; // below this confidence, offer the other guesses
const RECORD_LIMIT_MS = 29_500;

const show = (v: string | string[]) => (Array.isArray(v) ? v.join(', ') : v);

/**
 * "Answer by voice". Without Answer by speaking mode: press the button, speak, check the
 * "We heard" card and press Keep. In the mode: listening starts by itself after the question
 * was read, and what was heard goes straight into the field ("We heard: …"); Say again and
 * Type instead stay on screen, and the field can always be corrected by typing.
 */
export function VoiceInput({
  step,
  lang,
  onConfirm,
  onPending,
  onSpeechConsent,
  mode = false,
  autoStart = false,
  choices = [],
}: VoiceInputProps) {
  const online = useOnline();
  const { readAloud } = useModes();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const webSpeech = useWebSpeech();
  const recorder = useRecorder();

  const [state, setState] = useState<VoiceState>('idle');
  const [consentOpen, setConsentOpen] = useState(false);
  const [micHelpOpen, setMicHelpOpen] = useState(false);
  const [heard, setHeard] = useState<Heard | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mounted = useRef(true);
  const autoStarted = useRef(false);
  const recordTimer = useRef<number | null>(null);
  const focusNext = useRef<Focusable | null>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const sayAgainRef = useRef<HTMLButtonElement>(null);
  const voiceRef = useRef<HTMLButtonElement>(null);
  const refs = { stop: stopRef, keep: keepRef, sayAgain: sayAgainRef, voice: voiceRef };

  const isChoice = step.type === 'single_choice';
  const fieldLabel = step.title ? t(lang, step.title) : step.id;

  // Never leave the microphone (or the hold on the speaker) on after the question is gone.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recordTimer.current) window.clearTimeout(recordTimer.current);
      holdSpeech(false);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Focus: the button that had focus may go away when the state changes */
  /* ---------------------------------------------------------------- */

  const rootActive = (): Element | null => {
    const root = wrapperRef.current?.getRootNode() as Document | ShadowRoot | undefined;
    const active = root?.activeElement ?? null;
    return active && active !== document.body ? active : null;
  };

  /** Move focus to `target` after the next render, if focus is (or was) in these controls. */
  const keepFocus = (target: Focusable) => {
    const active = rootActive();
    const inside = !!active && !!wrapperRef.current?.contains(active);
    focusNext.current = inside || (focusNext.current && !active) ? target : null;
  };

  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    const active = rootActive();
    if (active && !wrapperRef.current?.contains(active)) {
      focusNext.current = null; // the person went elsewhere: leave focus alone
      return;
    }
    const el = refs[target].current;
    if (el) {
      focusNext.current = null;
      el.focus();
    }
  });

  const focusField = () => {
    const root = wrapperRef.current?.getRootNode();
    if (root instanceof ShadowRoot || root instanceof Document) {
      const el = root.getElementById(`q-${step.id}`) as HTMLElement | null;
      const target = el?.matches('input, textarea, select')
        ? el
        : el?.querySelector<HTMLElement>('input, textarea, select');
      (target ?? el)?.focus();
    }
  };

  /** Read aloud mode: say it too (fixed text by any voice; the learner's words on the device). */
  const say = (parts: Part[]) => {
    if (readAloud) void speak(parts, lang);
  };

  /* ---------------------------------------------------------------- */
  /*  Understanding what was said                                      */
  /* ---------------------------------------------------------------- */

  const interpret = (alternatives: SpeechAlternative[], mock = false): Heard => {
    const raw = alternatives[0]?.text ?? '';
    const base = { raw, mock, alternatives: [] as Alternative[] };
    if (isChoice) {
      for (const alt of alternatives) {
        const value = matchChoice(alt.text, choices, lang);
        const choice = choices.find((c) => c.value === value);
        if (choice)
          return { ...base, value, display: choice.label, personal: false, noMatch: false };
      }
      return { ...base, value: null, display: raw, personal: true, noMatch: true };
    }
    const value = normalizeVoiceInput(raw, step, lang);
    const display = show(value);
    const unsure = alternatives.length > 1 && (alternatives[0].confidence || 0) < UNSURE;
    const others: Alternative[] = [];
    if (unsure) {
      for (const alt of alternatives.slice(1)) {
        const v = normalizeVoiceInput(alt.text, step, lang);
        const d = show(v);
        if (d && d !== display && !others.some((o) => o.display === d)) {
          others.push({ value: v, display: d });
        }
      }
    }
    return { ...base, value, display, personal: true, noMatch: false, alternatives: others };
  };

  /** Mode (or a recorded clip the flow already put in the field): straight in, then
   * "We heard: …". Otherwise the "We heard" card with Keep. */
  const present = (h: Heard, alreadyFilled: boolean) => {
    if (!mounted.current) return;
    if (h.noMatch) {
      keepFocus('sayAgain');
      setHeard(h);
      setState('heard');
      announce(t(lang, 'voice.no_choice_match'));
      say([keyPart(lang, 'voice.no_choice_match')]);
      return;
    }
    const heardParts: Part[] = [
      keyPart(lang, 'voice.heard'),
      { text: h.display, personal: h.personal, fallbackKey: 'speech.answer_in_box' },
    ];
    if (mode || alreadyFilled) {
      if (!alreadyFilled) onConfirm(h.value);
      keepFocus('sayAgain');
      setHeard(h);
      setState('heard');
      const mockNote = h.mock ? ` ${t(lang, 'voice.mock_note')}` : '';
      announce(`${t(lang, 'voice.heard')} ${h.display}.${mockNote}`);
      say([...heardParts, h.mock && keyPart(lang, 'voice.mock_note')]);
      return;
    }
    keepFocus('keep');
    setHeard(h);
    setState('review');
    announce(`${t(lang, 'voice.heard')} ${h.display}`);
    say(heardParts);
  };

  /* ---------------------------------------------------------------- */
  /*  Recording on the phone (no browser speech, offline, or declined) */
  /* ---------------------------------------------------------------- */

  const finishRecording = async () => {
    if (recordTimer.current) window.clearTimeout(recordTimer.current);
    recordTimer.current = null;
    keepFocus('voice');
    const clipId = await recorder.stop();
    holdSpeech(false);
    if (!mounted.current) return;
    if (!clipId) {
      setState('idle');
      return;
    }
    setState('transcribing');
    announce(t(lang, 'voice.transcribing'));
    const outcome: VoiceClipOutcome | null | void = await onPending(clipId);
    if (!mounted.current) return;
    if (!outcome || 'code' in outcome) {
      keepFocus('voice');
      setState('idle');
      // The flow announced the problem already; say it too in Read aloud mode.
      if (outcome) say([t(lang, `errors.${outcome.code}`)]);
      return;
    }
    const text = isChoice ? (outcome.raw ?? outcome.text) : outcome.text;
    const h = interpret([{ text, confidence: 1 }], outcome.provider === 'mock');
    if (!isChoice) {
      h.value = outcome.text; // the flow put the cleaned text in the field already
      h.display = outcome.text;
    }
    present(h, !isChoice);
  };

  const startRecording = async () => {
    holdSpeech(true); // nothing may be said while the microphone is open
    keepFocus('stop');
    setState('recording');
    setNote(null);
    announce(t(lang, 'voice.recording'));
    try {
      await recorder.start();
      recordTimer.current = window.setTimeout(() => void finishRecording(), RECORD_LIMIT_MS);
    } catch {
      holdSpeech(false);
      if (!mounted.current) return;
      keepFocus('voice');
      setState('idle');
      setMicHelpOpen(true);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Browser speech recognition                                       */
  /* ---------------------------------------------------------------- */

  const didntCatch = () => {
    keepFocus('voice');
    setState('idle');
    setNote(t(lang, 'voice.didnt_catch'));
    announce(t(lang, 'voice.didnt_catch'));
    say([keyPart(lang, 'voice.didnt_catch')]);
  };

  const startListening = () => {
    holdSpeech(true); // nothing may be said while the microphone is open
    keepFocus('stop');
    setState('listening');
    setNote(null);
    setHeard(null);
    announce(t(lang, 'voice.listening'));
    let failed = false;
    webSpeech.start(lang, {
      onResult: (alternatives) => {
        holdSpeech(false);
        present(interpret(alternatives), false);
      },
      onError: (error) => {
        failed = true;
        holdSpeech(false);
        if (!mounted.current) return;
        if (error === 'not-allowed') {
          keepFocus('voice');
          setState('idle');
          setMicHelpOpen(true);
          announce(t(lang, 'voice.mic_help_title'));
        } else if (error === 'no-speech') {
          didntCatch();
        } else {
          void startRecording(); // the browser can't (network, language not supported)
        }
      },
      onEnd: (gotResult) => {
        if (gotResult || failed || !mounted.current) return;
        holdSpeech(false);
        didntCatch();
      },
    });
  };

  /** Start the best way this browser has (the cloud speech question is asked once, ever). */
  const begin = () => {
    setHeard(null);
    setNote(null);
    if (!online || !webSpeech.supported) {
      void startRecording();
      return;
    }
    const consent = getSpeechConsent();
    if (consent === null) {
      setConsentOpen(true);
      return;
    }
    if (consent === false) {
      void startRecording();
      return;
    }
    startListening();
  };

  // Answer by speaking: listen by itself once the question has been read (or at once).
  const beginRef = useRef(begin);
  beginRef.current = begin;
  useEffect(() => {
    if (!mode || !autoStart || autoStarted.current) return;
    autoStarted.current = true;
    beginRef.current();
  }, [mode, autoStart]);

  /* ---------------------------------------------------------------- */
  /*  Buttons                                                          */
  /* ---------------------------------------------------------------- */

  const handleConsentAgree = () => {
    setSpeechConsent(true);
    setConsentOpen(false);
    onSpeechConsent?.(true);
    startListening();
  };

  // "Use another way": remembered, so we don't ask again; record on the phone instead.
  const handleConsentDecline = () => {
    setSpeechConsent(false);
    setConsentOpen(false);
    onSpeechConsent?.(false);
    void startRecording();
  };

  const handleStop = () => {
    if (state === 'recording') {
      void finishRecording();
      return;
    }
    // What was said so far still comes as the result (it used to be thrown away here).
    webSpeech.stop();
  };

  const handleKeep = () => {
    if (!heard) return;
    onConfirm(heard.value);
    setState('idle');
    setHeard(null);
    announce(`${t(lang, 'voice.filled')} ${heard.display}`);
    focusField();
  };

  const handleAlternative = (alt: Alternative) => {
    onConfirm(alt.value);
    announce(`${t(lang, 'voice.filled')} ${alt.display}`);
    if (state === 'review' || !heard) {
      setState('idle');
      setHeard(null);
      focusField();
      return;
    }
    setHeard({ ...heard, value: alt.value, display: alt.display, alternatives: [] });
  };

  const handleSayAgain = () => {
    webSpeech.abort();
    begin();
  };

  const handleTypeInstead = () => {
    webSpeech.abort();
    holdSpeech(false);
    setState('idle');
    setHeard(null);
    setNote(null);
    focusField(); // inside the widget the shadow root is the root: look it up from our node
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Handle audio file fallback
    const clipId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    void onPending(clipId);
    announce(t(lang, 'status.saved_local'));
  };

  const activeCard = (text: string, recording: boolean) => (
    <div
      className="bo-card"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--bo-space-3)',
        border: '2px solid var(--bo-primary)',
        background: 'var(--bo-selected-bg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-3)' }}>
        <Icon name="mic" style={{ color: 'var(--bo-primary)' }} />
        <div>
          {/* The darker red: --bo-primary on this pink is only 4.35:1 */}
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--bo-primary-hover)' }}>{text}</p>
          {recording && (
            <p className="bo-hint" style={{ margin: 0 }}>
              {recorder.duration}s / 30s
            </p>
          )}
        </div>
      </div>
      <Button ref={refs.stop} variant={recording ? 'primary' : 'secondary'} onClick={handleStop}>
        {t(lang, 'voice.stop')}
      </Button>
    </div>
  );

  return (
    <div
      ref={wrapperRef}
      className="bo-voice-input-wrapper"
      style={{
        margin: 'var(--bo-space-3) 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--bo-space-3)',
      }}
    >
      {state === 'idle' && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--bo-space-2)',
            alignItems: 'center',
          }}
        >
          <Button
            ref={refs.voice}
            variant="secondary"
            onClick={begin}
            className="bo-voice-btn"
            aria-label={t(lang, 'common.answer_by_voice', { field: fieldLabel })}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--bo-space-2)' }}
          >
            <Icon name="mic" />
            <span>{t(lang, 'voice.button', { field: fieldLabel })}</span>
          </Button>

          {/* File upload fallback when mic is unavailable */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
            aria-hidden="true"
          />
        </div>
      )}

      {note && state === 'idle' && (
        <p className="bo-hint" style={{ margin: 0 }}>
          {note}
        </p>
      )}

      {state === 'listening' && activeCard(t(lang, 'voice.listening'), false)}
      {state === 'recording' && activeCard(t(lang, 'voice.recording'), true)}
      {state === 'transcribing' && (
        <p className="bo-hint" style={{ margin: 0, fontWeight: 600 }}>
          {t(lang, 'voice.transcribing')}
        </p>
      )}

      {state === 'review' && heard && (
        <ReviewCard
          rawTranscript={heard.raw}
          normalizedValue={heard.display}
          lang={lang}
          keepRef={refs.keep}
          onKeep={handleKeep}
          onSayAgain={handleSayAgain}
          onTypeInstead={handleTypeInstead}
          alternatives={heard.alternatives.map((a) => a.display)}
          onAlternative={(i) => handleAlternative(heard.alternatives[i])}
        />
      )}

      {state === 'heard' && heard && (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
          {heard.noMatch ? (
            <p style={{ margin: 0, fontWeight: 600 }}>{t(lang, 'voice.no_choice_match')}</p>
          ) : (
            <div>
              <p className="bo-hint" style={{ margin: 0, fontWeight: 600 }}>
                {t(lang, 'voice.heard')}
              </p>
              <p
                data-bo-private={heard.personal ? '' : undefined}
                style={{ margin: 'var(--bo-space-1) 0 0', fontSize: '1.1em', fontWeight: 700 }}
              >
                {heard.display}
              </p>
            </div>
          )}
          {heard.mock && (
            <p className="bo-hint" style={{ margin: 0, fontWeight: 600 }}>
              {t(lang, 'voice.mock_note')}
            </p>
          )}
          {step.type === 'text' && !heard.noMatch && (
            <p className="bo-hint" style={{ margin: 0 }}>
              {t(lang, 'voice.name_check')}
            </p>
          )}
          {heard.alternatives.length > 0 && (
            <div data-bo-private="">
              <p className="bo-hint" style={{ margin: '0 0 var(--bo-space-2)', fontWeight: 600 }}>
                {t(lang, 'voice.did_you_mean')}
              </p>
              <div className="bo-actions">
                {heard.alternatives.map((alt) => (
                  <Button
                    key={alt.display}
                    variant="secondary"
                    onClick={() => handleAlternative(alt)}
                  >
                    {alt.display}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="bo-actions">
            <Button
              ref={refs.sayAgain}
              variant="secondary"
              onClick={handleSayAgain}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--bo-space-2)' }}
            >
              <Icon name="mic" />
              <span>{t(lang, 'voice.say_again')}</span>
            </Button>
            {!isChoice && (
              <Button variant="secondary" onClick={handleTypeInstead}>
                {t(lang, 'voice.type_instead')}
              </Button>
            )}
          </div>
        </Card>
      )}

      <SpeechConsent
        open={consentOpen}
        lang={lang}
        onConsent={handleConsentAgree}
        onDecline={handleConsentDecline}
        onClose={() => setConsentOpen(false)}
      />

      <MicHelp open={micHelpOpen} lang={lang} onClose={() => setMicHelpOpen(false)} />
    </div>
  );
}
