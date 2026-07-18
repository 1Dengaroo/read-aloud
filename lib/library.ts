import { isSpeechMark } from "@/lib/synthesis";
import type { SavedReadingMeta, SpeechMark } from "@/lib/types";

/**
 * Saved-readings library backed by IndexedDB. Metadata (text + speech
 * marks) and MP3 blobs live in separate object stores so listing the
 * library never loads audio into memory. Client-side only.
 */

const DB_NAME = "aloud";
const DB_VERSION = 1;
const META_STORE = "readings";
const AUDIO_STORE = "audio";
const TITLE_MAX_LENGTH = 60;

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(
        new Error(request.error?.message ?? "Could not open the library."),
      );
    };
  });
  return databasePromise;
}

function requestResult(request: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(new Error(request.error?.message ?? "Library read failed."));
    };
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    const fail = () => {
      reject(new Error(transaction.error?.message ?? "Library write failed."));
    };
    transaction.onerror = fail;
    transaction.onabort = fail;
  });
}

function isSavedReadingMeta(value: unknown): value is SavedReadingMeta {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "text" in value &&
    typeof value.text === "string" &&
    "createdAt" in value &&
    typeof value.createdAt === "number" &&
    "marks" in value &&
    Array.isArray(value.marks) &&
    value.marks.every(isSpeechMark)
  );
}

function deriveTitle(text: string): string {
  const firstLine = text.split("\n", 1)[0].trim();
  if (firstLine.length <= TITLE_MAX_LENGTH) return firstLine;
  return `${firstLine.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`;
}

/** Ask the browser not to evict the library under storage pressure. */
export async function requestPersistentStorage(): Promise<void> {
  if (typeof navigator === "undefined") return;
  await navigator.storage?.persist().catch(() => false);
}

/** All saved readings, newest first. Audio blobs are not loaded. */
export async function listReadings(): Promise<SavedReadingMeta[]> {
  const db = await openDatabase();
  const store = db.transaction(META_STORE).objectStore(META_STORE);
  const rows = await requestResult(store.getAll());
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(isSavedReadingMeta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveReading(
  text: string,
  marks: SpeechMark[],
  audio: Blob,
): Promise<SavedReadingMeta> {
  const db = await openDatabase();
  const meta: SavedReadingMeta = {
    id: crypto.randomUUID(),
    title: deriveTitle(text),
    text,
    marks,
    createdAt: Date.now(),
  };
  const transaction = db.transaction([META_STORE, AUDIO_STORE], "readwrite");
  transaction.objectStore(META_STORE).put(meta);
  transaction.objectStore(AUDIO_STORE).put(audio, meta.id);
  await transactionDone(transaction);
  return meta;
}

/** The MP3 for a saved reading, or null if it's missing. */
export async function loadAudio(id: string): Promise<Blob | null> {
  const db = await openDatabase();
  const store = db.transaction(AUDIO_STORE).objectStore(AUDIO_STORE);
  const result = await requestResult(store.get(id));
  return result instanceof Blob ? result : null;
}

export async function deleteReading(id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction([META_STORE, AUDIO_STORE], "readwrite");
  transaction.objectStore(META_STORE).delete(id);
  transaction.objectStore(AUDIO_STORE).delete(id);
  await transactionDone(transaction);
}
