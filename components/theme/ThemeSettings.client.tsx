"use client";

import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PLAYBACK_RATES,
  readDefaultPlaybackRate,
  saveDefaultPlaybackRate,
} from "@/lib/playback";
import { defaultFontId, fonts, isFontId } from "@/lib/theme/font-registry";
import {
  defaultHighlightId,
  highlights,
  isHighlightId,
} from "@/lib/theme/highlight-registry";
import { themes } from "@/lib/theme/theme-registry";
import { cn } from "@/lib/utils";

/*
 * Miniature skeleton mock of the app, scoped with data-theme so every
 * color resolves from that theme's own tokens — previews can never
 * drift from the theme files.
 */
function ThemePreviewSkeleton({ themeId }: { themeId: string }) {
  return (
    <div
      data-theme={themeId}
      aria-hidden
      className="bg-background border-border pointer-events-none w-full overflow-hidden rounded-md border"
    >
      <div className="flex flex-col gap-1.5 p-2">
        <div className="flex items-center gap-1">
          <span className="bg-primary size-2 shrink-0 rounded-full" />
          <span className="bg-muted h-1.5 w-8 rounded-full" />
        </div>
        <div className="bg-card border-border flex flex-col gap-1 rounded-sm border p-1.5">
          <span className="bg-foreground/70 h-1.5 w-10 rounded-full" />
          <span className="bg-muted-foreground/50 h-1 w-14 max-w-full rounded-full" />
          <span className="bg-muted-foreground/30 h-1 w-12 rounded-full" />
        </div>
        <span className="bg-primary h-2.5 w-7 self-start rounded-full" />
      </div>
    </div>
  );
}

const emptySubscribe = () => () => {};

/*
 * FontScript sets data-font before hydration, so on the client the
 * attribute is the source of truth for the initial state.
 */
function readFont(): string {
  if (typeof document === "undefined") return defaultFontId;
  const id = document.documentElement.dataset.font;
  return isFontId(id) ? id : defaultFontId;
}

/* HighlightScript sets data-highlight pre-paint, same as the font. */
function readHighlight(): string {
  if (typeof document === "undefined") return defaultHighlightId;
  const id = document.documentElement.dataset.highlight;
  return isHighlightId(id) ? id : defaultHighlightId;
}

/*
 * Swatch scoped with data-highlight so it always resolves that mode's
 * own tokens — previews can never drift from highlights.css. Underline
 * renders as a thin bar, matching how that mode marks the word.
 */
function HighlightSwatch({ highlightId }: { highlightId: string }) {
  return (
    <span
      data-highlight={highlightId}
      aria-hidden
      className="flex size-3.5 shrink-0 items-end"
    >
      <span
        className={cn(
          "bg-hl-active w-full rounded-xs",
          highlightId === "underline" ? "h-1" : "h-full",
        )}
      />
    </span>
  );
}

export function ThemeSettings() {
  const { theme, setTheme } = useTheme();
  const [fontId, setFontId] = useState(readFont);
  const [highlightId, setHighlightId] = useState(readHighlight);
  const [playbackRate, setPlaybackRate] = useState(readDefaultPlaybackRate);

  const applyPlaybackRate = (value: string) => {
    const rate = Number(value);
    if (!PLAYBACK_RATES.includes(rate)) return;
    saveDefaultPlaybackRate(rate);
    setPlaybackRate(rate);
  };

  const applyFont = (id: string) => {
    document.documentElement.dataset.font = id;
    localStorage.setItem("font", id);
    setFontId(id);
  };

  const applyHighlight = (id: string) => {
    document.documentElement.dataset.highlight = id;
    localStorage.setItem("highlight", id);
    setHighlightId(id);
  };
  // True after hydration only — the server render must not mark a theme
  // selected, since it can't know the persisted choice.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open settings"
          className="text-muted-foreground"
        >
          <Settings className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Customize your appearance and playback.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <section>
            <h3 className="section-label text-content-secondary mb-3 font-medium">
              Theme
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {themes.map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  shape="soft"
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    "h-auto flex-col items-center gap-1.5 p-2.5 text-xs font-normal",
                    mounted &&
                      t.id === theme &&
                      "border-primary ring-primary ring-1",
                  )}
                >
                  <ThemePreviewSkeleton themeId={t.id} />
                  <span>{t.name}</span>
                  <span className="text-muted-foreground">{t.description}</span>
                </Button>
              ))}
            </div>
          </section>
          <section>
            <h3 className="section-label text-content-secondary mb-3 font-medium">
              Highlight
            </h3>
            <Select value={highlightId} onValueChange={applyHighlight}>
              <SelectTrigger className="w-full" aria-label="Reading highlight">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {highlights.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    <HighlightSwatch highlightId={h.id} />
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>
          <section>
            <h3 className="section-label text-content-secondary mb-3 font-medium">
              Playback speed
            </h3>
            <Select
              value={String(playbackRate)}
              onValueChange={applyPlaybackRate}
            >
              <SelectTrigger
                className="w-full tabular-nums"
                aria-label="Default playback speed"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYBACK_RATES.map((rate) => (
                  <SelectItem
                    key={rate}
                    value={String(rate)}
                    className="tabular-nums"
                  >
                    {rate}×{rate === 1 ? " · Normal" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>
          <section>
            <h3 className="section-label text-content-secondary mb-3 font-medium">
              Font
            </h3>
            <Select value={fontId} onValueChange={applyFont}>
              <SelectTrigger className="w-full" aria-label="Reading font">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fonts.map((f) => (
                  <SelectItem
                    key={f.id}
                    value={f.id}
                    style={{ fontFamily: f.family }}
                  >
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
