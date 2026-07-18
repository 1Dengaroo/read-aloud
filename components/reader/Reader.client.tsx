"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Library } from "@/components/reader/Library.client";
import { Outline } from "@/components/reader/Outline.client";
import { PlayerDock } from "@/components/reader/PlayerDock.client";
import { ThemeSettings } from "@/components/theme/ThemeSettings.client";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteReading,
  listReadings,
  loadAudio,
  requestPersistentStorage,
  saveReading,
} from "@/lib/library";
import { annotateMarkdown, buildSegmentRuns } from "@/lib/markdown";
import {
  PLAYBACK_RATES,
  PLAYBACK_RATE_EVENT,
  readDefaultPlaybackRate,
} from "@/lib/playback";
import {
  MAX_TEXT_LENGTH,
  buildSegments,
  buildSentenceByMark,
  findActiveMark,
} from "@/lib/synthesis";
import { synthesizeReading } from "@/lib/synthesize-client";
import type {
  OutlineHeading,
  PlaybackStatus,
  SavedReadingMeta,
  SpeechMark,
  StyledRun,
  SynthesisProgress,
  WordSegment,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface Synthesis {
  text: string;
  audio: Blob;
  /** Object URL for `audio` — revoked when the synthesis is replaced. */
  audioSrc: string;
  marks: SpeechMark[];
  segments: WordSegment[];
  /** Exact decoded duration; null for library loads (metadata fills in). */
  durationMs: number | null;
  /** Library id when this synthesis is saved, null otherwise. */
  sourceId: string | null;
}

const AVERAGE_WORDS_PER_MINUTE = 170;

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

function listenEstimate(wordCount: number): string {
  const minutes = Math.round(wordCount / AVERAGE_WORDS_PER_MINUTE);
  return minutes < 1 ? "under a minute" : `~${minutes} min listen`;
}

/** A segment's children: plain text, or markdown-styled sub-runs. */
function renderSegmentContent(
  runs: StyledRun[] | null | undefined,
  text: string,
) {
  if (!runs) return text;
  return runs.map((run, index) => (
    <span key={index} className={run.className ?? undefined}>
      {run.text}
    </span>
  ));
}

export function Reader() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"edit" | "read">("edit");
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [progress, setProgress] = useState<SynthesisProgress | null>(null);
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [saved, setSaved] = useState<SavedReadingMeta[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [playhead, setPlayhead] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState(readDefaultPlaybackRate);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wordsRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const pillTopRef = useRef<number | null>(null);
  const pillIndexRef = useRef(-1);
  /** Set before an outline jump so its block:"start" scroll wins. */
  const suppressAutoScrollRef = useRef(false);

  const sentenceByMark = useMemo(
    () => (synthesis ? buildSentenceByMark(synthesis.segments) : []),
    [synthesis],
  );
  const activeSentence = activeIndex >= 0 ? sentenceByMark[activeIndex] : -1;

  const markdown = useMemo(
    () => (synthesis ? annotateMarkdown(synthesis.text) : null),
    [synthesis],
  );
  const segmentRuns = useMemo(
    () =>
      synthesis && markdown
        ? buildSegmentRuns(synthesis.segments, markdown.decorations)
        : [],
    [synthesis, markdown],
  );
  // Each heading resolved to the first spoken word at/after its content.
  const outline = useMemo((): OutlineHeading[] => {
    if (!synthesis || !markdown) return [];
    const entries: OutlineHeading[] = [];
    let segIndex = 0;
    for (const heading of markdown.headings) {
      while (
        segIndex < synthesis.segments.length &&
        (synthesis.segments[segIndex].markIndex === null ||
          synthesis.segments[segIndex].charStart < heading.charStart)
      ) {
        segIndex++;
      }
      const markIndex = synthesis.segments[segIndex]?.markIndex;
      if (typeof markIndex === "number")
        entries.push({ ...heading, markIndex });
    }
    return entries;
  }, [synthesis, markdown]);

  let activeHeading = -1;
  for (let index = 0; index < outline.length; index++) {
    if (outline[index].markIndex <= activeIndex) activeHeading = index;
    else break;
  }

  /*
   * Move the sliding pill to the word span for `markIndex` by setting the
   * geometry vars styles/highlights.css transitions. Sliding only happens
   * along a line — a line jump, fresh appearance, or reflow (`snap`)
   * repositions instantly so the pill never sweeps diagonally.
   */
  const positionPill = useCallback((markIndex: number, snap: boolean) => {
    const pill = pillRef.current;
    const container = wordsRef.current;
    if (!pill || !container) return;
    if (markIndex < 0) {
      pill.style.opacity = "0";
      pillIndexRef.current = -1;
      return;
    }
    const word = container.querySelector(`[data-mark="${markIndex}"]`);
    if (!(word instanceof HTMLElement)) return;
    /*
     * A word span can fragment across lines (the browser may break after
     * a hyphen), and the offset* box then spans both fragments — the pill
     * would stretch to the right and cover two lines. Measure the first
     * line fragment instead, in container-relative coordinates.
     */
    const rect = word.getClientRects()[0];
    if (!rect) return;
    const containerRect = container.getBoundingClientRect();
    const x = rect.left - containerRect.left;
    const y = rect.top - containerRect.top;
    const instant =
      snap || pillIndexRef.current === -1 || y !== pillTopRef.current;
    pill.style.setProperty("--hl-duration", instant ? "0ms" : "150ms");
    pill.style.setProperty("--hl-x", `${x}px`);
    pill.style.setProperty("--hl-y", `${y}px`);
    pill.style.setProperty("--hl-w", `${rect.width}px`);
    pill.style.setProperty("--hl-h", `${rect.height}px`);
    pill.style.opacity = "1";
    pillTopRef.current = y;
    pillIndexRef.current = markIndex;
  }, []);

  useLayoutEffect(() => {
    positionPill(activeIndex, false);
  }, [activeIndex, synthesis, mode, positionPill]);

  useEffect(() => {
    if (mode !== "read") return;
    const container = wordsRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() =>
      positionPill(pillIndexRef.current, true),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [mode, positionPill]);

  useEffect(() => {
    listReadings()
      .then(setSaved)
      .catch(() => setSaved([]));
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

  useEffect(() => {
    if (activeIndex < 0) return;
    if (suppressAutoScrollRef.current) {
      suppressAutoScrollRef.current = false;
      return;
    }
    const word = wordsRef.current?.querySelector(
      `[data-mark="${activeIndex}"]`,
    );
    word?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  const replaceSynthesis = (next: Synthesis) => {
    if (synthesis) URL.revokeObjectURL(synthesis.audioSrc);
    setSynthesis(next);
    setActiveIndex(-1);
    setPlayhead(0);
    // Library loads lack an exact duration until audio metadata arrives —
    // the last mark's time is close enough for the scrubber meanwhile.
    setDurationSec((next.durationMs ?? next.marks.at(-1)?.time ?? 0) / 1000);
  };

  const attachAudio = (next: Synthesis): HTMLAudioElement => {
    audioRef.current?.pause();
    const audio = new Audio(next.audioSrc);
    audio.playbackRate = rate;
    const syncPlayhead = () => setPlayhead(quantize(audio.currentTime));
    // timeupdate only fires ~4x/sec — too coarse to catch every word.
    // Poll the playhead each animation frame while playing instead.
    let frame = 0;
    const step = () => {
      setActiveIndex(findActiveMark(next.marks, audio.currentTime * 1000));
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
      setActiveIndex(findActiveMark(next.marks, audio.currentTime * 1000));
    });
    audio.addEventListener("loadedmetadata", () => {
      if (next.durationMs === null && Number.isFinite(audio.duration)) {
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
    return audio;
  };

  const trimmed = text.trim();
  const wordCount = useMemo(
    () => (trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length),
    [trimmed],
  );
  const overLimit = trimmed.length > MAX_TEXT_LENGTH;
  const nearLimit = trimmed.length > MAX_TEXT_LENGTH * 0.9;
  const isSaved = synthesis?.sourceId != null;

  const handleListen = async () => {
    setError(null);
    if (trimmed.length === 0 || overLimit) return;
    if (synthesis && synthesis.text === trimmed && audioRef.current) {
      setMode("read");
      play(audioRef.current);
      return;
    }
    setStatus("loading");
    try {
      const reading = await synthesizeReading(trimmed, setProgress);
      const next: Synthesis = {
        ...reading,
        audioSrc: URL.createObjectURL(reading.audio),
        segments: buildSegments(reading.text, reading.marks),
        sourceId: null,
      };
      replaceSynthesis(next);
      setMode("read");
      play(attachAudio(next));
    } catch (caught) {
      setStatus("idle");
      setError(
        caught instanceof Error ? caught.message : "Speech synthesis failed.",
      );
    } finally {
      setProgress(null);
    }
  };

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (status === "playing") audio.pause();
    else play(audio);
  };

  const handleSeek = (seconds: number) => {
    const audio = audioRef.current;
    const marks = synthesis?.marks;
    if (!audio || !marks) return;
    const upper = durationSec > 0 ? durationSec : seconds;
    const clamped = Math.min(Math.max(seconds, 0), upper);
    audio.currentTime = clamped;
    setPlayhead(quantize(clamped));
    setActiveIndex(findActiveMark(marks, clamped * 1000));
  };

  const handleWordClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    const span = event.target.closest("[data-mark]");
    if (!(span instanceof HTMLElement)) return;
    const mark = synthesis?.marks[Number(span.dataset.mark)];
    if (!mark) return;
    handleSeek(mark.time / 1000);
    if (status !== "playing" && audioRef.current) play(audioRef.current);
  };

  const handleJumpToHeading = (heading: OutlineHeading) => {
    const mark = synthesis?.marks[heading.markIndex];
    if (!mark) return;
    suppressAutoScrollRef.current = true;
    handleSeek(mark.time / 1000);
    const word = wordsRef.current?.querySelector(
      `[data-mark="${heading.markIndex}"]`,
    );
    word?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const handleEdit = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setActiveIndex(-1);
    setPlayhead(0);
    setStatus("idle");
    setMode("edit");
  };

  const handleCycleRate = () => {
    const index = PLAYBACK_RATES.indexOf(rate);
    setRate(PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length]);
  };

  const handleSave = async () => {
    if (!synthesis || synthesis.sourceId !== null) return;
    setError(null);
    try {
      await requestPersistentStorage();
      const meta = await saveReading(
        synthesis.text,
        synthesis.marks,
        synthesis.audio,
      );
      setSynthesis({ ...synthesis, sourceId: meta.id });
      setSaved((previous) => [meta, ...previous]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save reading.",
      );
    }
  };

  const handleLoad = async (meta: SavedReadingMeta) => {
    setError(null);
    try {
      const audio = await loadAudio(meta.id);
      if (audio === null) {
        throw new Error("The audio for this reading is missing.");
      }
      const next: Synthesis = {
        text: meta.text,
        audio,
        audioSrc: URL.createObjectURL(audio),
        marks: meta.marks,
        segments: buildSegments(meta.text, meta.marks),
        durationMs: null,
        sourceId: meta.id,
      };
      replaceSynthesis(next);
      setText(meta.text);
      setMode("read");
      play(attachAudio(next));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load reading.",
      );
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await deleteReading(id);
      setSaved((previous) => previous.filter((meta) => meta.id !== id));
      if (synthesis?.sourceId === id) {
        setSynthesis({ ...synthesis, sourceId: null });
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not delete reading.",
      );
    }
  };

  /*
   * Global shortcuts in read mode: Space play/pause, ←/→ seek ±5s,
   * E back to edit. Skipped while a control, field, or dialog has focus
   * so native behavior (button activation, typing) is untouched.
   */
  useEffect(() => {
    if (mode !== "read") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          "input, textarea, select, button, [role='slider'], [role='dialog'], [contenteditable='true']",
        )
      ) {
        return;
      }
      const audio = audioRef.current;
      if (event.key === " ") {
        event.preventDefault();
        if (!audio) return;
        if (status === "playing") audio.pause();
        else play(audio);
      } else if (event.key === "ArrowRight" && audio) {
        event.preventDefault();
        handleSeek(audio.currentTime + 5);
      } else if (event.key === "ArrowLeft" && audio) {
        event.preventDefault();
        handleSeek(audio.currentTime - 5);
      } else if (event.key === "e" || event.key === "E") {
        handleEdit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="flex flex-1 flex-col">
      <header className="animate-in fade-in mb-10 flex items-center justify-between gap-4 duration-500">
        <h1 className="font-heading text-lg font-semibold tracking-tight">
          ReadAloud
        </h1>
        <div className="flex items-center gap-1">
          <Library
            readings={saved}
            activeId={synthesis?.sourceId ?? null}
            onLoad={(meta) => void handleLoad(meta)}
            onDelete={(id) => void handleDelete(id)}
          />
          <ThemeSettings />
        </div>
      </header>

      {mode === "edit" ? (
        <section
          key="edit"
          className="animate-in fade-in slide-in-from-bottom-2 flex flex-1 flex-col gap-4 duration-300"
        >
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste anything — an article, a chapter, an email…"
            aria-label="Text to read aloud"
            autoFocus
            className="placeholder:text-content-muted min-h-[55vh] flex-1 resize-none rounded-none border-0 bg-transparent p-0 text-lg leading-8 shadow-none focus-visible:border-transparent focus-visible:ring-0 disabled:bg-transparent md:text-lg dark:bg-transparent"
            disabled={status === "loading"}
          />
          <div className="text-content-muted flex min-h-5 items-center gap-3 text-sm tabular-nums">
            {trimmed.length > 0 && (
              <span>
                {listenEstimate(wordCount)} · {wordCount.toLocaleString()} words
              </span>
            )}
            {nearLimit && (
              <span className={cn(overLimit && "text-destructive")}>
                {trimmed.length.toLocaleString()} /{" "}
                {MAX_TEXT_LENGTH.toLocaleString()} characters
              </span>
            )}
            {error !== null && (
              <span role="alert" className="text-destructive">
                {error}
              </span>
            )}
          </div>
        </section>
      ) : (
        <section
          key="read"
          className="animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          {outline.length > 0 && (
            <Outline
              headings={outline}
              activeHeading={activeHeading}
              onSelect={handleJumpToHeading}
            />
          )}
          {error !== null && (
            <p role="alert" className="text-destructive mb-4 text-sm">
              {error}
            </p>
          )}
          <div
            ref={wordsRef}
            onClick={handleWordClick}
            aria-live="off"
            className="reading-surface relative isolate text-lg leading-8 whitespace-pre-wrap sm:text-xl sm:leading-9"
          >
            <div
              ref={pillRef}
              aria-hidden
              className="reading-pill pointer-events-none absolute top-0 left-0 -z-10"
            />
            {synthesis?.segments.map((segment, index) =>
              segment.markIndex === null ? (
                <span
                  key={index}
                  className={cn(
                    "transition-colors duration-150",
                    segment.sentenceIndex === activeSentence &&
                      "bg-hl-sentence",
                  )}
                >
                  {renderSegmentContent(segmentRuns[index], segment.text)}
                </span>
              ) : (
                <span
                  key={index}
                  data-mark={segment.markIndex}
                  className={cn(
                    "transition-colors duration-150",
                    segment.sentenceIndex === activeSentence &&
                      "bg-hl-sentence",
                    segment.markIndex === activeIndex &&
                      "text-hl-active-foreground",
                  )}
                >
                  {renderSegmentContent(segmentRuns[index], segment.text)}
                </span>
              ),
            )}
          </div>
        </section>
      )}

      <PlayerDock
        mode={mode}
        status={status}
        progress={progress}
        canListen={trimmed.length > 0 && !overLimit}
        playheadSec={playhead}
        durationSec={durationSec}
        rate={rate}
        isSaved={isSaved}
        onListen={() => void handleListen()}
        onPlayPause={handlePlayPause}
        onSeek={handleSeek}
        onCycleRate={handleCycleRate}
        onSave={() => void handleSave()}
        onEdit={handleEdit}
      />
    </div>
  );
}
