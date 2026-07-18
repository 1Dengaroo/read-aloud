import { NextResponse } from "next/server";
import { synthesizeAudio, synthesizeSpeechMarks } from "@/lib/polly";
import { MAX_TEXT_LENGTH } from "@/lib/synthesis";
import type { SynthesizeResponse } from "@/lib/types";

function parseText(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("text" in body)) {
    return null;
  }
  const { text } = body;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TEXT_LENGTH) return null;
  return trimmed;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const text = parseText(body);
  if (text === null) {
    return NextResponse.json(
      { error: `Provide non-empty text up to ${MAX_TEXT_LENGTH} characters.` },
      { status: 400 },
    );
  }

  try {
    // Audio and speech marks cannot share one Polly request — fetch both.
    const [audio, marks] = await Promise.all([
      synthesizeAudio(text),
      synthesizeSpeechMarks(text),
    ]);
    const response: SynthesizeResponse = { text, audio, marks };
    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speech synthesis failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
