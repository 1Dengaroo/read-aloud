"use client";

import { useEffect, useState } from "react";
import {
  deleteReading,
  listReadings,
  requestPersistentStorage,
  saveReading,
} from "@/lib/library";
import type { SavedReadingMeta, SpeechMark } from "@/lib/types";

export interface SavedReadings {
  /** Newest first, kept in sync with IndexedDB. */
  readings: SavedReadingMeta[];
  save: (
    text: string,
    marks: SpeechMark[],
    audio: Blob,
  ) => Promise<SavedReadingMeta>;
  remove: (id: string) => Promise<void>;
}

/**
 * The saved-readings collection: loads the library on mount and keeps
 * the list in step with saves and deletes. Errors propagate to the
 * caller — how to surface them is the Reader's concern.
 */
export function useSavedReadings(): SavedReadings {
  const [readings, setReadings] = useState<SavedReadingMeta[]>([]);

  useEffect(() => {
    listReadings()
      .then(setReadings)
      .catch(() => setReadings([]));
  }, []);

  const save = async (
    text: string,
    marks: SpeechMark[],
    audio: Blob,
  ): Promise<SavedReadingMeta> => {
    await requestPersistentStorage();
    const meta = await saveReading(text, marks, audio);
    setReadings((previous) => [meta, ...previous]);
    return meta;
  };

  const remove = async (id: string): Promise<void> => {
    await deleteReading(id);
    setReadings((previous) => previous.filter((meta) => meta.id !== id));
  };

  return { readings, save, remove };
}
