import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { announce } from '../a11y/announce';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { t } from '../i18n/t';
import { useOnline } from '../offline/useOnline';
import { MicHelp } from './MicHelp';
import { normalizeVoiceInput } from './normalize';
import { ReviewCard } from './ReviewCard';
import { SpeechConsent } from './SpeechConsent';
import type { VoiceInputProps } from './types';
import { useRecorder } from './useRecorder';
import { useWebSpeech } from './useWebSpeech';

type VoiceState = 'idle' | 'listening' | 'recording' | 'review';

export function VoiceInput({ step, lang, onConfirm, onPending, onSpeechConsent }: VoiceInputProps) {
  const online = useOnline();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const webSpeech = useWebSpeech();
  const recorder = useRecorder();

  const [state, setState] = useState<VoiceState>('idle');
  const [consentOpen, setConsentOpen] = useState(false);
  const [micHelpOpen, setMicHelpOpen] = useState(false);
  const [hasConsent, setHasConsent] = useState(() => {
    return (
      typeof localStorage !== 'undefined' && localStorage.getItem('bo:speech_consent') === 'true'
    );
  });

  const [rawText, setRawText] = useState('');
  const [normalized, setNormalized] = useState<string | string[]>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // React to WebSpeech transcript changes
  useEffect(() => {
    if (webSpeech.transcript && state === 'listening') {
      const raw = webSpeech.transcript;
      setRawText(raw);
      const clean = normalizeVoiceInput(raw, step, lang);
      setNormalized(clean);
      setState('review');
      announce(t(lang, 'voice.got_it'));
    }
  }, [webSpeech.transcript, state, step, lang]);

  const startRecordingMode = useCallback(async () => {
    setState('recording');
    announce(t(lang, 'voice.recording'));
    try {
      await recorder.start();
    } catch {
      setState('idle');
      setMicHelpOpen(true);
    }
  }, [lang, recorder]);

  // React to WebSpeech errors
  useEffect(() => {
    if (webSpeech.error && state === 'listening') {
      if (webSpeech.error === 'not-allowed') {
        setState('idle');
        setMicHelpOpen(true);
        announce(t(lang, 'voice.mic_help_title'));
      } else if (webSpeech.error === 'no-speech') {
        announce(t(lang, 'voice.didnt_catch'));
        setState('idle');
      } else {
        // Fall back to recorder
        startRecordingMode();
      }
    }
  }, [webSpeech.error, state, lang, startRecordingMode]);

  const startWebSpeech = useCallback(() => {
    setState('listening');
    announce(t(lang, 'voice.listening'));
    webSpeech.start(lang);
  }, [lang, webSpeech]);

  const handleStartVoice = useCallback(() => {
    if (!online || !webSpeech.supported) {
      // Offline or WebSpeech not supported in this browser: use recorder
      startRecordingMode();
      return;
    }

    // First time browser speech recognition is used, prompt consent
    if (!hasConsent) {
      setConsentOpen(true);
      return;
    }

    startWebSpeech();
  }, [online, webSpeech.supported, hasConsent, startRecordingMode, startWebSpeech]);

  const handleConsentAgree = useCallback(() => {
    setHasConsent(true);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bo:speech_consent', 'true');
    }
    setConsentOpen(false);
    onSpeechConsent?.(true);
    startWebSpeech();
  }, [startWebSpeech, onSpeechConsent]);

  const handleConsentDecline = useCallback(() => {
    setConsentOpen(false);
    onSpeechConsent?.(false);
    // User declined Google Speech: use on-device recorder fallback
    startRecordingMode();
  }, [startRecordingMode, onSpeechConsent]);

  const handleStopListening = useCallback(() => {
    webSpeech.stop();
    setState('idle');
  }, [webSpeech]);

  const handleStopRecording = useCallback(async () => {
    const clipId = await recorder.stop();
    setState('idle');
    if (clipId) {
      onPending(clipId);
      announce(t(lang, 'status.saved_local'));
    }
  }, [recorder, onPending, lang]);

  const handleKeep = useCallback(() => {
    onConfirm(normalized);
    setState('idle');
    setRawText('');
    setNormalized('');
    const shown = Array.isArray(normalized) ? normalized.join(', ') : normalized;
    announce(`${t(lang, 'voice.filled')} ${shown}`);
  }, [normalized, onConfirm, lang]);

  const handleSayAgain = useCallback(() => {
    setState('idle');
    setRawText('');
    setNormalized('');
    handleStartVoice();
  }, [handleStartVoice]);

  const handleTypeInstead = useCallback(() => {
    setState('idle');
    setRawText('');
    setNormalized('');
    // Return focus to the input. Look it up from our own node: inside the widget the
    // shadow root is the root, and document.activeElement would only be the host element.
    const root = wrapperRef.current?.getRootNode();
    if (root instanceof ShadowRoot || root instanceof Document) {
      const input = root.getElementById(`q-${step.id}`) as HTMLElement | null;
      input?.focus();
    }
  }, [step.id]);

  const handleFileUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Handle audio file fallback
      const clipId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      onPending(clipId);
      announce(t(lang, 'status.saved_local'));
    },
    [onPending, lang],
  );

  const fieldLabel = step.title ? t(lang, step.title) : step.id;

  return (
    <div
      ref={wrapperRef}
      className="bo-voice-input-wrapper"
      style={{ margin: 'var(--bo-space-3) 0' }}
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
            variant="secondary"
            onClick={handleStartVoice}
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

      {state === 'listening' && (
        <div
          className="bo-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--bo-space-3)',
            border: '2px solid var(--bo-primary)',
            background: 'var(--bo-selected-bg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-3)' }}>
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'var(--bo-primary)',
                animation: 'bo-spin 1.5s infinite linear',
              }}
            />
            <span style={{ fontWeight: 700, color: 'var(--bo-primary)' }}>
              {t(lang, 'voice.listening')}
            </span>
          </div>
          <Button variant="secondary" onClick={handleStopListening}>
            {t(lang, 'voice.stop')}
          </Button>
        </div>
      )}

      {state === 'recording' && (
        <div
          className="bo-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--bo-space-3)',
            border: '2px solid var(--bo-primary)',
            background: 'var(--bo-selected-bg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-3)' }}>
            <Icon name="stop" style={{ color: 'var(--bo-primary)' }} />
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: 'var(--bo-primary)' }}>
                {t(lang, 'voice.recording')}
              </p>
              <p className="bo-hint" style={{ margin: 0 }}>
                {recorder.duration}s / 30s
              </p>
            </div>
          </div>
          <Button variant="primary" onClick={handleStopRecording}>
            {t(lang, 'voice.stop')}
          </Button>
        </div>
      )}

      {state === 'review' && (
        <ReviewCard
          rawTranscript={rawText}
          normalizedValue={normalized}
          lang={lang}
          onKeep={handleKeep}
          onSayAgain={handleSayAgain}
          onTypeInstead={handleTypeInstead}
        />
      )}

      <SpeechConsent
        open={consentOpen}
        lang={lang}
        onConsent={handleConsentAgree}
        onDecline={handleConsentDecline}
      />

      <MicHelp open={micHelpOpen} lang={lang} onClose={() => setMicHelpOpen(false)} />
    </div>
  );
}
