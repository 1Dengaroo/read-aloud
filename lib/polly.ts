import {
  PollyClient,
  SynthesizeSpeechCommand,
  type SynthesizeSpeechCommandInput,
} from "@aws-sdk/client-polly";
import { isSpeechMark } from "@/lib/synthesis";
import type { SpeechMark } from "@/lib/types";

const VOICE = {
  Engine: "neural",
  VoiceId: "Matthew",
  LanguageCode: "en-US",
  TextType: "text",
} satisfies Partial<SynthesizeSpeechCommandInput>;

const client = new PollyClient({ region: process.env.AWS_REGION });

/** Synthesize `text` to MP3, returned as base64. */
export async function synthesizeAudio(text: string): Promise<string> {
  const response = await client.send(
    new SynthesizeSpeechCommand({ ...VOICE, OutputFormat: "mp3", Text: text }),
  );
  if (!response.AudioStream) {
    throw new Error("Polly returned no audio stream");
  }
  const bytes = await response.AudioStream.transformToByteArray();
  return Buffer.from(bytes).toString("base64");
}

/** Fetch word-level speech marks for `text` (newline-delimited JSON). */
export async function synthesizeSpeechMarks(
  text: string,
): Promise<SpeechMark[]> {
  const response = await client.send(
    new SynthesizeSpeechCommand({
      ...VOICE,
      OutputFormat: "json",
      SpeechMarkTypes: ["word"],
      Text: text,
    }),
  );
  if (!response.AudioStream) {
    throw new Error("Polly returned no speech marks stream");
  }
  const ndjson = await response.AudioStream.transformToString();
  return ndjson
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line): unknown => JSON.parse(line))
    .filter(isSpeechMark);
}
