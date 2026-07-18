"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookmarkCheck,
  BookmarkPlus,
  Loader2,
  Pause,
  PencilLine,
  Play,
  Square,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteReading,
  listReadings,
  loadAudio,
  requestPersistentStorage,
  saveReading,
} from "@/lib/library";
import {
  MAX_TEXT_LENGTH,
  buildSegments,
  findActiveMark,
  isSynthesizeResponse,
} from "@/lib/synthesis";
import type {
  SavedReadingMeta,
  SpeechMark,
  SynthesizeRequest,
  WordSegment,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Status = "idle" | "loading" | "playing" | "paused";

interface Synthesis {
  text: string;
  audio: Blob;
  /** Object URL for `audio` — revoked when the synthesis is replaced. */
  audioSrc: string;
  marks: SpeechMark[];
  segments: WordSegment[];
  /** Library id when this synthesis is saved, null otherwise. */
  sourceId: string | null;
}

function errorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return "Speech synthesis failed.";
}

function base64ToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "audio/mpeg" });
}

async function synthesize(text: string): Promise<Synthesis> {
  const payload: SynthesizeRequest = { text };
  const response = await fetch("/api/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch((): null => null);
  if (!response.ok) throw new Error(errorMessage(body));
  if (!isSynthesizeResponse(body)) {
    throw new Error("Received a malformed synthesis response.");
  }
  const audio = base64ToBlob(body.audio);
  return {
    text: body.text,
    audio,
    audioSrc: URL.createObjectURL(audio),
    marks: body.marks,
    segments: buildSegments(body.text, body.marks),
    sourceId: null,
  };
}

function formatSavedAt(createdAt: number): string {
  return new Date(createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDuration(marks: SpeechMark[]): string {
  const totalSeconds = Math.round((marks.at(-1)?.time ?? 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function Reader() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"edit" | "read">("edit");
  const [status, setStatus] = useState<Status>("idle");
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [saved, setSaved] = useState<SavedReadingMeta[]>([]);
  const [pendingDelete, setPendingDelete] = useState<SavedReadingMeta | null>(
    null,
  );
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState(1.5);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wordsRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (activeIndex < 0) return;
    const word = wordsRef.current?.querySelector(
      `[data-mark="${activeIndex}"]`,
    );
    word?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  const replaceSynthesis = (next: Synthesis) => {
    if (synthesis) URL.revokeObjectURL(synthesis.audioSrc);
    setSynthesis(next);
    setActiveIndex(-1);
  };

  const attachAudio = (next: Synthesis): HTMLAudioElement => {
    audioRef.current?.pause();
    const audio = new Audio(next.audioSrc);
    audio.playbackRate = rate;
    // timeupdate only fires ~4x/sec — too coarse to catch every word.
    // Poll the playhead each animation frame while playing instead.
    let frame = 0;
    const step = () => {
      setActiveIndex(findActiveMark(next.marks, audio.currentTime * 1000));
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
    audio.addEventListener("ended", () => {
      cancelAnimationFrame(frame);
      audio.currentTime = 0;
      setActiveIndex(-1);
      setStatus("idle");
    });
    audioRef.current = audio;
    return audio;
  };

  const play = (audio: HTMLAudioElement) => {
    // Rejections (e.g. an autoplay block) surface as a paused UI, not a
    // console error — the user can simply press Play.
    audio.play().catch(() => undefined);
  };

  const handlePlay = async () => {
    setError(null);
    if (mode === "read" && audioRef.current) {
      play(audioRef.current);
      return;
    }
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_TEXT_LENGTH) return;
    if (synthesis && synthesis.text === trimmed && audioRef.current) {
      setMode("read");
      play(audioRef.current);
      return;
    }
    setStatus("loading");
    try {
      const next = await synthesize(trimmed);
      replaceSynthesis(next);
      setMode("read");
      play(attachAudio(next));
    } catch (caught) {
      setStatus("idle");
      setError(
        caught instanceof Error ? caught.message : "Speech synthesis failed.",
      );
    }
  };

  const handlePause = () => audioRef.current?.pause();

  const handleStop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setActiveIndex(-1);
    setStatus("idle");
  };

  const handleEdit = () => {
    handleStop();
    setMode("edit");
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

  const trimmedLength = text.trim().length;
  const overLimit = trimmedLength > MAX_TEXT_LENGTH;
  const isSaved = synthesis?.sourceId != null;

  return (
    <div className="flex flex-col-reverse items-start gap-8 md:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-3 md:w-64">
        <h2 className="text-content-secondary text-sm font-medium">
          Saved readings
        </h2>
        {saved.length === 0 ? (
          <p className="text-content-muted text-sm">
            Nothing saved yet. Synthesize some text and press Save.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {saved.map((meta) => (
              <li
                key={meta.id}
                className={cn(
                  "border-edge-default bg-surface-elevated flex items-center gap-2 rounded-lg border px-3 py-2 shadow-sm",
                  synthesis?.sourceId === meta.id && "border-edge-strong",
                )}
              >
                <button
                  type="button"
                  onClick={() => void handleLoad(meta)}
                  className="focus-visible:ring-ring/50 flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-sm text-left outline-none focus-visible:ring-3"
                >
                  <span className="text-content-primary w-full truncate text-sm font-medium">
                    {meta.title}
                  </span>
                  <span className="text-content-muted text-xs tabular-nums">
                    {formatSavedAt(meta.createdAt)} ·{" "}
                    {formatDuration(meta.marks)}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPendingDelete(meta)}
                  aria-label={`Delete "${meta.title}"`}
                  className="text-content-muted hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-8">
        {mode === "edit" ? (
          <section className="flex flex-col gap-3">
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste the text you want read aloud…"
              aria-label="Text to read aloud"
              className="bg-surface-elevated dark:bg-surface-elevated min-h-64 p-6 text-base leading-7 shadow-sm"
              disabled={status === "loading"}
            />
            <div className="flex items-center gap-3">
              <Button
                onClick={handlePlay}
                disabled={
                  status === "loading" || trimmedLength === 0 || overLimit
                }
              >
                {status === "loading" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Play />
                )}
                Play
              </Button>
              <span
                className={cn(
                  "text-sm tabular-nums",
                  overLimit ? "text-destructive" : "text-content-muted",
                )}
              >
                {trimmedLength} / {MAX_TEXT_LENGTH}
              </span>
              {error !== null && (
                <span role="alert" className="text-destructive text-sm">
                  {error}
                </span>
              )}
            </div>
          </section>
        ) : (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {status === "playing" ? (
                <Button onClick={handlePause} aria-label="Pause">
                  <Pause />
                  Pause
                </Button>
              ) : (
                <Button onClick={handlePlay} aria-label="Play">
                  <Play />
                  Play
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleStop}
                disabled={status === "idle"}
                aria-label="Stop"
              >
                <Square />
                Stop
              </Button>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={isSaved}
                aria-label={isSaved ? "Saved" : "Save reading"}
              >
                {isSaved ? <BookmarkCheck /> : <BookmarkPlus />}
                {isSaved ? "Saved" : "Save"}
              </Button>
              <div className="ml-2 flex w-44 items-center gap-2">
                <Slider
                  value={[rate]}
                  onValueChange={(values) => setRate(values[0])}
                  min={0.5}
                  max={2}
                  step={0.25}
                  aria-label="Playback speed"
                />
                <span className="text-content-secondary w-10 shrink-0 text-sm tabular-nums">
                  {rate}×
                </span>
              </div>
              <Button variant="ghost" onClick={handleEdit} className="ml-auto">
                <PencilLine />
                Edit text
              </Button>
            </div>
            {error !== null && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <div
              ref={wordsRef}
              aria-live="off"
              className="border-edge-default bg-surface-elevated max-h-[60vh] overflow-y-auto rounded-lg border p-6 text-lg leading-8 whitespace-pre-wrap shadow-sm"
            >
              {synthesis?.segments.map((segment, index) =>
                segment.markIndex === null ? (
                  <span key={index}>{segment.text}</span>
                ) : (
                  <span
                    key={index}
                    data-mark={segment.markIndex}
                    className={cn(
                      "transition-colors duration-100",
                      segment.markIndex === activeIndex &&
                        "bg-highlight text-highlight-foreground",
                    )}
                  >
                    {segment.text}
                  </span>
                ),
              )}
            </div>
          </section>
        )}
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reading?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.title}” and its audio will be permanently removed
              from this browser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) void handleDelete(pendingDelete.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
