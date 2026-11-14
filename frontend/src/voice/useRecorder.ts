import { useCallback, useEffect, useRef, useState } from 'react';
import { set as idbSet } from 'idb-keyval';
import { widgetStore } from '../offline/db';

const MAX_DURATION_MS = 30_000; // 30 seconds

export interface UseRecorderReturn {
  /** Currently recording audio. */
  recording: boolean;
  /** Elapsed recording time in seconds. */
  duration: number;
  /** Start recording. Must be called from a user action. */
  start: () => Promise<void>;
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

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopInternal = useCallback(async (): Promise<string | null> => {
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

        const recordedBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
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

  const start = useCallback(async () => {
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

    // Duration counter
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);

    // Auto-stop at MAX_DURATION_MS
    timeoutRef.current = setTimeout(() => {
      void stopInternal();
    }, MAX_DURATION_MS);
  }, [stopInternal]);

  return {
    recording,
    duration,
    start,
    stop: stopInternal,
    blob,
  };
}
