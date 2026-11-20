import { useCallback, useEffect, useRef, useState } from 'react';
import { set as idbSet } from 'idb-keyval';
import { widgetStore } from '../offline/db';

const MAX_DURATION_MS = 30_000; // 30 seconds

// Stop by itself: after speech, this much quiet ends the answer; with no speech at all, give up
// after NO_SPEECH_MS (nothing is sent then).
const END_SILENCE_MS = 1500;
const NO_SPEECH_MS = 8000;

export interface RecorderOptions {
  /** The person stopped talking (heardSpeech) or never started: stop the recording now. */
  onSilence?: (heardSpeech: boolean) => void;
}

/**
 * Watch the microphone level (Web Audio). Returns a function that stops watching. Does nothing
 * where the browser won't run audio processing without a tap: the Stop button still works.
 */
function watchSilence(stream: MediaStream, onSilence: (heardSpeech: boolean) => void): () => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctx) return () => {};
  let ctx: AudioContext;
  try {
    ctx = new Ctx();
  } catch {
    return () => {};
  }
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  const started = performance.now();
  let floor = 1; // the quietest level so far (background noise)
  let heard = false;
  let quietSince = 0;
  let done = false;

  const stop = () => {
    if (done) return;
    done = true;
    window.clearInterval(timer);
    try {
      source.disconnect();
    } catch {
      // already disconnected
    }
    void ctx.close().catch(() => {});
  };

  const timer = window.setInterval(() => {
    if (ctx.state !== 'running') return; // can't measure: the Stop button only
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const level = Math.sqrt(sum / buf.length);
    floor = Math.min(floor, Math.max(level, 0.001));
    const now = performance.now();
    if (level > Math.max(0.02, floor * 4)) {
      heard = true;
      quietSince = 0;
      return;
    }
    if (!heard) {
      if (now - started > NO_SPEECH_MS) {
        stop();
        onSilence(false);
      }
      return;
    }
    if (level < Math.max(0.012, floor * 2.5)) {
      if (!quietSince) quietSince = now;
      else if (now - quietSince > END_SILENCE_MS) {
        stop();
        onSilence(true);
      }
    } else {
      quietSince = 0;
    }
  }, 100);

  return stop;
}

export interface UseRecorderReturn {
  /** Currently recording audio. */
  recording: boolean;
  /** Elapsed recording time in seconds. */
  duration: number;
  /** Start recording. Must be called from a user action. */
  start: (options?: RecorderOptions) => Promise<void>;
  /** Stop recording and save the clip. Returns the clip ID. */
  stop: () => Promise<string | null>;
  /** The last recorded blob, if any. */
  blob: Blob | null;
}

function generateClipId(): string {
  return `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * React hook for recording audio via MediaRecorder.
 * Stores clips in IndexedDB via widgetStore().
 */
export function useRecorder(): UseRecorderReturn {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const resolveSaveRef = useRef<((clipId: string | null) => void) | null>(null);
  const unwatchRef = useRef<(() => void) | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      unwatchRef.current?.();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopInternal = useCallback(async (): Promise<string | null> => {
    unwatchRef.current?.();
    unwatchRef.current = null;
    return new Promise<string | null>((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }

      resolveSaveRef.current = resolve;

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        // Clear timers
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        // The browser's own format (Chrome/Android: audio/webm; iPhone Safari: audio/mp4), so
        // the upload is named right (transcribe() picks .webm or .m4a from it).
        const type = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const recordedBlob = new Blob(chunksRef.current, { type });
        setBlob(recordedBlob);
        setRecording(false);

        // Stop all tracks
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        // Save to IndexedDB
        const clipId = generateClipId();
        try {
          await idbSet(clipId, recordedBlob, widgetStore());
          resolveSaveRef.current?.(clipId);
        } catch {
          resolveSaveRef.current?.(null);
        }
        resolveSaveRef.current = null;
      };

      mediaRecorderRef.current.stop();
    });
  }, []);

  const start = useCallback(
    async (options?: RecorderOptions) => {
      chunksRef.current = [];
      setBlob(null);
      setDuration(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(1000); // Collect chunks every second
      startTimeRef.current = Date.now();
      setRecording(true);
      if (options?.onSilence) unwatchRef.current = watchSilence(stream, options.onSilence);

      // Duration counter
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);

      // Auto-stop at MAX_DURATION_MS
      timeoutRef.current = setTimeout(() => {
        void stopInternal();
      }, MAX_DURATION_MS);
    },
    [stopInternal],
  );

  return {
    recording,
    duration,
    start,
    stop: stopInternal,
    blob,
  };
}
