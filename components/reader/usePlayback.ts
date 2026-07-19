"use client";

import { useEffect, useRef, useState } from "react";
import {
  PLAYBACK_RATES,
  PLAYBACK_RATE_EVENT,
  readDefaultPlaybackRate,
} from "@/lib/playback";
import { findActiveMark } from "@/lib/synthesis";
import type { ActiveReading, PlaybackStatus, SpeechMark } from "@/lib/types";

/*
 * Rejections (e.g. an autoplay block) surface as a paused UI, not a
 * console error — the user can simply press Play.
 */
function play(audio: HTMLAudioElement) {
  audio.play().catch(() => undefined);
}

/** Quantize to quarter seconds so scrubber re-renders stay ~4/s. */
function quantize(seconds: number): number {
  return Math.floor(seconds * 4) / 4;
}

export interface PlaybackController {
  status: PlaybackStatus;
  /** Speech-mark index of the word being spoken, or -1. */
  activeIndex: number;
  /** Quantized playhead position in seconds. */
  playhead: number;
  durationSec: number;
  rate: number;
  /** Attach `reading` as the current audio and start playing. */
  start: (reading: ActiveReading) => void;
  /** Play the already-attached audio (no-op when none). */
  resume: () => void;
  playPause: () => void;
  seek: (seconds: number) => void;
  seekBy: (deltaSeconds: number) => void;
  cycleRate: () => void;
  /** Mark the whole chunked synthesis as in flight. */
  beginLoading: () => void;
  /** Synthesis failed — back to idle (any attached audio is untouched). */
  cancelLoading: () => void;
  /** Pause, rewind, and clear playback state (leaving read mode). */
  stop: () => void;
}

/**
 * The audio engine behind the reader: owns the HTMLAudioElement, keeps
 * `activeIndex`/`playhead` in sync with it (polled per animation frame
 * while playing — timeupdate only fires ~4x/sec and skips words), and
 * exposes transport controls. The playback rate follows the default in
 * Settings live via PLAYBACK_RATE_EVENT.
 */
export function usePlayback(): PlaybackController {
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [playhead, setPlayhead] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [rate, setRate] = useState(readDefaultPlaybackRate);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const marksRef = useRef<SpeechMark[]>([]);

  useEffect(() => {
    const cleanup = () => audioRef.current?.pause();
    return cleanup;
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  // Changing the default speed in Settings applies to this session too.
  useEffect(() => {
    const onRateChange = () => setRate(readDefaultPlaybackRate());
    window.addEventListener(PLAYBACK_RATE_EVENT, onRateChange);
    return () => window.removeEventListener(PLAYBACK_RATE_EVENT, onRateChange);
  }, []);

  const start = (reading: ActiveReading) => {
    audioRef.current?.pause();
    marksRef.current = reading.marks;
    setActiveIndex(-1);
    setPlayhead(0);
    // Library loads lack an exact duration until audio metadata arrives —
    // the last mark's time is close enough for the scrubber meanwhile.
    setDurationSec(
      (reading.durationMs ?? reading.marks.at(-1)?.time ?? 0) / 1000,
    );

    const audio = new Audio(reading.audioSrc);
    audio.playbackRate = rate;
    const syncPlayhead = () => setPlayhead(quantize(audio.currentTime));
    const syncActiveIndex = () =>
      setActiveIndex(findActiveMark(reading.marks, audio.currentTime * 1000));
    let frame = 0;
    const step = () => {
      syncActiveIndex();
      syncPlayhead();
      frame = requestAnimationFrame(step);
    };
    audio.addEventListener("play", () => {
      setStatus("playing");
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(step);
    });
    audio.addEventListener("pause", () => {
      setStatus("paused");
      cancelAnimationFrame(frame);
    });
    audio.addEventListener("seeked", () => {
      syncPlayhead();
      syncActiveIndex();
    });
    audio.addEventListener("loadedmetadata", () => {
      if (reading.durationMs === null && Number.isFinite(audio.duration)) {
        setDurationSec(audio.duration);
      }
    });
    audio.addEventListener("ended", () => {
      cancelAnimationFrame(frame);
      audio.currentTime = 0;
      setActiveIndex(-1);
      setPlayhead(0);
      setStatus("idle");
    });
    audioRef.current = audio;
    play(audio);
  };

  const resume = () => {
    if (audioRef.current) play(audioRef.current);
  };

  const playPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (status === "playing") audio.pause();
    else play(audio);
  };

  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const upper = durationSec > 0 ? durationSec : seconds;
    const clamped = Math.min(Math.max(seconds, 0), upper);
    audio.currentTime = clamped;
    setPlayhead(quantize(clamped));
    setActiveIndex(findActiveMark(marksRef.current, clamped * 1000));
  };

  const seekBy = (deltaSeconds: number) => {
    const audio = audioRef.current;
    if (audio) seek(audio.currentTime + deltaSeconds);
  };

  const cycleRate = () => {
    const index = PLAYBACK_RATES.indexOf(rate);
    setRate(PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length]);
  };

  const stop = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setActiveIndex(-1);
    setPlayhead(0);
    setStatus("idle");
  };

  return {
    status,
    activeIndex,
    playhead,
    durationSec,
    rate,
    start,
    resume,
    playPause,
    seek,
    seekBy,
    cycleRate,
    beginLoading: () => setStatus("loading"),
    cancelLoading: () => setStatus("idle"),
    stop,
  };
}
