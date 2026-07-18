import { Reader } from "@/components/Reader.client";
import { ThemeSettings } from "@/components/theme/ThemeSettings.client";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            ReadAloud
          </h1>
          <p className="text-content-secondary text-sm">
            Paste text, press play, follow along word by word.
          </p>
        </div>
        <ThemeSettings />
      </header>
      <Reader />
    </main>
  );
}
