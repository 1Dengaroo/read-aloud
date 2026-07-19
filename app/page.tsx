import { Reader } from "@/components/reader/Reader.client";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pt-8 pb-40">
      <Reader />
    </main>
  );
}
