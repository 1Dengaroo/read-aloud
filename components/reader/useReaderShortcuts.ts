"use client";

import { useEffect } from "react";

interface ReaderShortcuts {
  enabled: boolean;
  onPlayPause: () => void;
  onSeekBy: (deltaSeconds: number) => void;
  onEdit: () => void;
}

/**
 * Global shortcuts in read mode: Space play/pause, ←/→ seek ±5s,
 * E back to edit. Skipped while a control, field, or dialog has focus
 * so native behavior (button activation, typing) is untouched.
 */
export function useReaderShortcuts({
  enabled,
  onPlayPause,
  onSeekBy,
  onEdit,
}: ReaderShortcuts): void {
  // No dependency array: the handlers close over fresh state each
  // render, so the listener is intentionally re-subscribed every time.
  useEffect(() => {
    if (!enabled) return;
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
      if (event.key === " ") {
        event.preventDefault();
        onPlayPause();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onSeekBy(5);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onSeekBy(-5);
      } else if (event.key === "e" || event.key === "E") {
        onEdit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
}
