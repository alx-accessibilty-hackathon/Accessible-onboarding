import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { t } from './t';

// Global singleton to ensure only ONE audio plays at any time across the entire widget
let activeAudio: HTMLAudioElement | null = null;
let activeStopCallback: (() => void) | null = null;

// Recorded clips live next to the widget script (element.tsx sets this), not on the host page.
let audioBase = '/audio/';
export function setAudioBase(url: string) {
  audioBase = url.endsWith('/') ? url : `${url}/`;
}

const probes = new Map<string, Promise<boolean>>();

// Is there a recorded clip? (A dev server answers missing files with HTML, so check the type.)
function hasAudioFile(url: string): Promise<boolean> {
  let probe = probes.get(url);
  if (!probe) {
    probe =
      typeof fetch === 'function'
        ? fetch(url, { method: 'HEAD' })
            .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith('audio'))
            .catch(() => false)
        : Promise.resolve(false);
    probes.set(url, probe);
  }
  return probe;
}

// Can the browser read this language aloud itself? (English always; others need a voice.)
function canSynthesize(lang: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  if (lang === 'en') return true;
  return window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith(lang));
}

export function stopAnyActiveAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (activeStopCallback) {
    activeStopCallback();
    activeStopCallback = null;
  }
}

export interface ReadAloudProps {
  /** The translation key, e.g. "signup.welcome.title" */
  stringKey: string;
  /** Language: "en" | "am" */
  lang: string;
  /** Fallback plain text if synthesizing speech */
  fallbackText?: string;
  className?: string;
}

export function ReadAloud({
  stringKey,
  lang,
  fallbackText,
  className,
}: ReadAloudProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasClip, setHasClip] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrl = `${audioBase}${lang}/${stringKey}.mp3`;
  const synth = canSynthesize(lang);

  // Hide the button when there is nothing to play (no clip and no voice for this language).
  useEffect(() => {
    let active = true;
    setHasClip(false);
    void hasAudioFile(audioUrl).then((ok) => {
      if (active) setHasClip(ok);
    });
    return () => {
      active = false;
    };
  }, [audioUrl]);

  const stop = useCallback(() => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (activeAudio === audioRef.current) {
      activeAudio = null;
    }
  }, []);

  // Stop playback when stringKey or lang changes, or on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stringKey, lang, stop]);

  const handleToggle = useCallback(() => {
    if (isPlaying) {
      stop();
      return;
    }

    // Stop any other currently playing audio
    stopAnyActiveAudio();

    const speak = () => {
      const textToSpeak = fallbackText ?? t(lang, stringKey);
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = lang === 'en' ? 'en-US' : lang;
      utterance.onend = () => {
        setIsPlaying(false);
        activeStopCallback = null;
      };
      utterance.onerror = () => {
        setIsPlaying(false);
        activeStopCallback = null;
      };
      activeStopCallback = () => {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
      };
      setIsPlaying(true);
      window.speechSynthesis.speak(utterance);
    };

    if (!hasClip) {
      if (synth) speak();
      return;
    }

    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    activeAudio = audio;
    activeStopCallback = () => setIsPlaying(false);

    audio.onended = () => {
      setIsPlaying(false);
      activeAudio = null;
      activeStopCallback = null;
    };

    audio.onerror = () => {
      // Audio file failed to load: use the browser's voice if it has one, else stop quietly
      activeAudio = null;
      if (synth) {
        speak();
        return;
      }
      setIsPlaying(false);
      activeStopCallback = null;
    };

    setIsPlaying(true);
    audio.play().catch(() => {
      // Autoplay or playback failure
      setIsPlaying(false);
      activeAudio = null;
      activeStopCallback = null;
    });
  }, [isPlaying, lang, stringKey, fallbackText, stop, hasClip, synth, audioUrl]);

  if (!hasClip && !synth) return null;

  const cls = className
    ? `bo-read-aloud bo-btn bo-btn-secondary ${className}`
    : 'bo-read-aloud bo-btn bo-btn-secondary';

  return (
    <button
      type="button"
      className={cls}
      onClick={handleToggle}
      aria-label={isPlaying ? `${t(lang, 'common.listen')} (playing)` : t(lang, 'common.listen')}
      aria-pressed={isPlaying}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--bo-space-2)',
        minHeight: 'var(--bo-target)',
        padding: '0.4em 0.8em',
      }}
    >
      <Icon name={isPlaying ? 'stop' : 'volume_up'} />
      <span>{t(lang, 'common.listen')}</span>
    </button>
  );
}
