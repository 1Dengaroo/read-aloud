"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Library } from "@/components/reader/Library.client";
import { Outline } from "@/components/reader/Outline.client";
import { PlayerDock } from "@/components/reader/PlayerDock.client";
import { ReadingSurface } from "@/components/reader/ReadingSurface.client";
import { wordElement } from "@/components/reader/reading-dom";
import { useFollowPlayhead } from "@/components/reader/useFollowPlayhead";
import { usePlayback } from "@/components/reader/usePlayback";
import { useReaderShortcuts } from "@/components/reader/useReaderShortcuts";
import { useSavedReadings } from "@/components/reader/useSavedReadings";
import { ThemeSettings } from "@/components/theme/ThemeSettings.client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listenEstimate } from "@/lib/format";
import { loadAudio } from "@/lib/library";
import {
  activeHeadingIndex,
  annotateMarkdown,
  buildOutline,
} from "@/lib/markdown";
import { MAX_TEXT_LENGTH, buildSegments } from "@/lib/synthesis";
import { synthesizeReading } from "@/lib/synthesize-client";
import type {
  ActiveReading,
  OutlineHeading,
  SavedReadingMeta,
  SynthesisProgress,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The reading room's conductor: owns the edit/read mode, the current
 * reading, and the error banner, and wires the feature hooks (playback,
 * saved readings, follow, shortcuts) to the presentational components.
 * The heavy lifting lives in those hooks and in lib/.
 */
export function Reader() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"edit" | "read">("edit");
  const [reading, setReading] = useState<ActiveReading | null>(null);
  const [progress, setProgress] = useState<SynthesisProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wordsRef = useRef<HTMLDivElement | null>(null);
  const playback = usePlayback();
  const library = useSavedReadings();
  const follow = useFollowPlayhead(
    wordsRef,
    playback.activeIndex,
    mode === "read",
  );

  const markdown = useMemo(
    () => (reading ? annotateMarkdown(reading.text) : null),
    [reading],
  );
  const outline = useMemo(
    () =>
      reading && markdown
        ? buildOutline(reading.segments, markdown.headings)
        : [],
    [reading, markdown],
  );
  const activeHeading = activeHeadingIndex(outline, playback.activeIndex);

  const trimmed = text.trim();
  const wordCount = useMemo(
    () => (trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length),
    [trimmed],
  );
  const overLimit = trimmed.length > MAX_TEXT_LENGTH;
  const nearLimit = trimmed.length > MAX_TEXT_LENGTH * 0.9;
  const isSaved = reading?.sourceId != null;

  /** Swap in `next` as the current reading and start playing it. */
  const startReading = (next: ActiveReading) => {
    if (reading) URL.revokeObjectURL(reading.audioSrc);
    setReading(next);
    setMode("read");
    playback.start(next);
  };

  const handleListen = async () => {
    setError(null);
    if (trimmed.length === 0 || overLimit) return;
    if (reading && reading.text === trimmed) {
      setMode("read");
      playback.resume();
      return;
    }
    playback.beginLoading();
    try {
      const synthesized = await synthesizeReading(trimmed, setProgress);
      startReading({
        ...synthesized,
        audioSrc: URL.createObjectURL(synthesized.audio),
        segments: buildSegments(synthesized.text, synthesized.marks),
        sourceId: null,
      });
    } catch (caught) {
      playback.cancelLoading();
      setError(
        caught instanceof Error ? caught.message : "Speech synthesis failed.",
      );
    } finally {
      setProgress(null);
    }
  };

  const handleWordSelect = (markIndex: number) => {
    const mark = reading?.marks[markIndex];
    if (!mark) return;
    playback.seek(mark.time / 1000);
    if (playback.status !== "playing") playback.resume();
  };

  const handleJumpToHeading = (heading: OutlineHeading) => {
    const mark = reading?.marks[heading.markIndex];
    if (!mark) return;
    // The heading's own block:"start" scroll must win over auto-follow.
    follow.suppressNextAutoScroll();
    playback.seek(mark.time / 1000);
    wordElement(wordsRef.current, heading.markIndex)?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  };

  const handleEdit = () => {
    playback.stop();
    setMode("edit");
  };

  const handleSave = async () => {
    if (!reading || reading.sourceId !== null) return;
    setError(null);
    try {
      const meta = await library.save(
        reading.text,
        reading.marks,
        reading.audio,
      );
      setReading({ ...reading, sourceId: meta.id });
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
      setText(meta.text);
      startReading({
        text: meta.text,
        audio,
        audioSrc: URL.createObjectURL(audio),
        marks: meta.marks,
        segments: buildSegments(meta.text, meta.marks),
        durationMs: null,
        sourceId: meta.id,
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load reading.",
      );
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await library.remove(id);
      if (reading?.sourceId === id) {
        setReading({ ...reading, sourceId: null });
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not delete reading.",
      );
    }
  };

  useReaderShortcuts({
    enabled: mode === "read",
    onPlayPause: playback.playPause,
    onSeekBy: playback.seekBy,
    onEdit: handleEdit,
  });

  return (
    <div className="flex flex-1 flex-col">
      <header className="animate-in fade-in mb-10 flex items-center justify-between gap-4 duration-500">
        <h1 className="font-heading text-lg font-semibold tracking-tight">
          ReadAloud
        </h1>
        <div className="flex items-center gap-1">
          <Library
            readings={library.readings}
            activeId={reading?.sourceId ?? null}
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
            disabled={playback.status === "loading"}
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
          {!follow.playheadVisible && playback.activeIndex >= 0 && (
            <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
              <Button
                variant="outline"
                size="sm"
                onClick={follow.scrollToPlayhead}
                className="animate-in fade-in slide-in-from-bottom-2 border-edge-subtle bg-surface-elevated/90 pointer-events-auto shadow-md backdrop-blur-md duration-200"
              >
                {follow.playheadBelow ? <ArrowDown /> : <ArrowUp />}
                Back to playhead
              </Button>
            </div>
          )}
          <ReadingSurface
            segments={reading?.segments ?? []}
            markdown={markdown}
            activeIndex={playback.activeIndex}
            containerRef={wordsRef}
            onWordSelect={handleWordSelect}
          />
        </section>
      )}

      <PlayerDock
        mode={mode}
        status={playback.status}
        progress={progress}
        canListen={trimmed.length > 0 && !overLimit}
        playheadSec={playback.playhead}
        durationSec={playback.durationSec}
        rate={playback.rate}
        isSaved={isSaved}
        onListen={() => void handleListen()}
        onPlayPause={playback.playPause}
        onSeek={playback.seek}
        onCycleRate={playback.cycleRate}
        onSave={() => void handleSave()}
        onEdit={handleEdit}
      />
    </div>
  );
}
