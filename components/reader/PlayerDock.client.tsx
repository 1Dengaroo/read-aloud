"use client";

import {
  BookmarkCheck,
  BookmarkPlus,
  Loader2,
  Pause,
  PencilLine,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatClock } from "@/lib/format";
import type { PlaybackStatus, SynthesisProgress } from "@/lib/types";

interface PlayerDockProps {
  mode: "edit" | "read";
  status: PlaybackStatus;
  progress: SynthesisProgress | null;
  canListen: boolean;
  playheadSec: number;
  durationSec: number;
  rate: number;
  isSaved: boolean;
  onListen: () => void;
  onPlayPause: () => void;
  onSeek: (seconds: number) => void;
  onCycleRate: () => void;
  onSave: () => void;
  onEdit: () => void;
}

/**
 * The one control surface — a floating pill fixed above the bottom
 * edge. In edit mode it holds only the Listen action (plus chunk
 * progress while synthesizing); in read mode, the full player.
 */
export function PlayerDock({
  mode,
  status,
  progress,
  canListen,
  playheadSec,
  durationSec,
  rate,
  isSaved,
  onListen,
  onPlayPause,
  onSeek,
  onCycleRate,
  onSave,
  onEdit,
}: PlayerDockProps) {
  const loading = status === "loading";
  const chunked = progress !== null && progress.total > 1;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="animate-in fade-in slide-in-from-bottom-4 border-edge-subtle bg-surface-elevated/85 pointer-events-auto flex items-center gap-2 rounded-full border p-2 shadow-lg backdrop-blur-md duration-500">
        {mode === "edit" ? (
          <>
            <Button
              size="lg"
              onClick={onListen}
              disabled={!canListen || loading}
              className="px-7"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Play />}
              {loading
                ? chunked
                  ? `Preparing ${progress.done} / ${progress.total}`
                  : "Preparing…"
                : "Listen"}
            </Button>
            {loading && chunked && (
              <div className="bg-muted mr-3 h-1 w-24 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full transition-[width] duration-300"
                  style={{
                    width: `${(progress.done / progress.total) * 100}%`,
                  }}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <Button
              size="icon-lg"
              onClick={onPlayPause}
              aria-label={status === "playing" ? "Pause" : "Play"}
            >
              {status === "playing" ? <Pause /> : <Play />}
            </Button>
            <span className="text-content-secondary pl-1 text-xs tabular-nums">
              {formatClock(playheadSec)}
            </span>
            <Slider
              value={[Math.min(playheadSec, durationSec)]}
              min={0}
              max={Math.max(durationSec, 0.25)}
              step={0.25}
              onValueChange={(values) => onSeek(values[0])}
              aria-label="Seek"
              className="w-32 sm:w-56"
            />
            <span className="text-content-muted pr-1 text-xs tabular-nums">
              {formatClock(durationSec)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCycleRate}
              aria-label={`Playback speed ${rate}×, click to change`}
              className="w-12 px-0 tabular-nums"
            >
              {rate}×
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onSave}
              disabled={isSaved}
              aria-label={isSaved ? "Saved" : "Save reading"}
            >
              {isSaved ? <BookmarkCheck /> : <BookmarkPlus />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onEdit}
              aria-label="Edit text"
            >
              <PencilLine />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
