/**
 * Default playback speed — a user setting persisted in localStorage
 * under "playback-rate" (same pattern as font/highlight, minus the
 * pre-paint script: speed never affects rendering). Saving dispatches
 * PLAYBACK_RATE_EVENT so a mounted Reader adopts the change live.
 */

export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
export const PLAYBACK_RATE_EVENT = "playback-rate-change";

const DEFAULT_PLAYBACK_RATE = 1;

const STORAGE_KEY = "playback-rate";

export function readDefaultPlaybackRate(): number {
  if (typeof localStorage === "undefined") return DEFAULT_PLAYBACK_RATE;
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return PLAYBACK_RATES.includes(stored) ? stored : DEFAULT_PLAYBACK_RATE;
}

export function saveDefaultPlaybackRate(rate: number): void {
  if (!PLAYBACK_RATES.includes(rate)) return;
  localStorage.setItem(STORAGE_KEY, String(rate));
  window.dispatchEvent(new Event(PLAYBACK_RATE_EVENT));
}
