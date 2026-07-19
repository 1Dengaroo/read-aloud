"use client";

import { useState } from "react";
import { BookOpen, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatClock, formatSavedAt } from "@/lib/format";
import type { SavedReadingMeta, SpeechMark } from "@/lib/types";
import { cn } from "@/lib/utils";

interface LibraryProps {
  readings: SavedReadingMeta[];
  /** Library id of the reading currently loaded, if any. */
  activeId: string | null;
  onLoad: (meta: SavedReadingMeta) => void;
  onDelete: (id: string) => void;
}

function formatDuration(marks: SpeechMark[]): string {
  return formatClock((marks.at(-1)?.time ?? 0) / 1000);
}

/** Saved-readings library — a header icon that opens a picker dialog. */
export function Library({
  readings,
  activeId,
  onLoad,
  onDelete,
}: LibraryProps) {
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SavedReadingMeta | null>(
    null,
  );

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open library"
            className="text-muted-foreground"
          >
            <BookOpen />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Library</DialogTitle>
            <DialogDescription>
              Saved readings live in this browser — pick one to listen again.
            </DialogDescription>
          </DialogHeader>
          {readings.length === 0 ? (
            <p className="text-content-muted py-4 text-sm">
              Nothing saved yet. Synthesize some text and press the bookmark in
              the player.
            </p>
          ) : (
            <ul className="-mx-2 flex max-h-80 flex-col gap-1 overflow-y-auto px-2 py-1">
              {readings.map((meta) => (
                <li
                  key={meta.id}
                  className={cn(
                    "hover:bg-muted/60 flex items-center gap-2 rounded-lg px-2 py-2 transition-colors",
                    activeId === meta.id && "bg-muted/60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onLoad(meta);
                      setOpen(false);
                    }}
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
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen) setPendingDelete(null);
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
                if (pendingDelete) onDelete(pendingDelete.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
