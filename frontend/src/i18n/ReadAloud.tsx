import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { t } from './t';

// Global singleton to ensure only ONE audio plays at any time across the entire widget
let activeAudio: HTMLAudioElement | null = null;
let activeStopCallback: (() => void) | null = null;

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
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

    const audioUrl = `/audio/${lang}/${stringKey}.mp3`;
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
      // Audio file not found or failed to load
      // For English, fall back to browser SpeechSynthesis if available
      if (lang === 'en' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const textToSpeak = fallbackText ?? t(lang, stringKey);
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = 'en-US';
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
        window.speechSynthesis.speak(utterance);
        return;
      }

      // In Amharic or unsupported fallback, stop without faking
      setIsPlaying(false);
      activeAudio = null;
      activeStopCallback = null;
    };

    setIsPlaying(true);
    audio.play().catch(() => {
      // Autoplay or playback failure
      setIsPlaying(false);
      activeAudio = null;
      activeStopCallback = null;
    });
  }, [isPlaying, lang, stringKey, fallbackText, stop]);

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
