import { z } from "zod";
import { getOpenAIClient } from "@/lib/openai";

export const runtime = "nodejs";

const BodySchema = z.object({
  text: z.string().min(1).max(3000),
  mode: z.enum(["tts", "emotion", "emotion_music"]).default("tts"),
  voice: z.enum(["alloy","ash","ballad","coral","echo","fable","onyx","nova","sage","shimmer","verse"]).default("coral"),
  emotionPreset: z.enum(["neutral","warm","excited","somber","mysterious"]).optional(),
  speed: z.number().min(0.6).max(1.4).optional()
});

function instructionsFor(mode: string, preset?: string) {
  if (mode === "tts") return "Speak clearly and neutrally, as if narrating for a research study.";
  // emotion / emotion_music both use expressive intonation; music mixing happens client-side in MVP.
  const base = "Speak clearly with expressive intonation suitable for conveying an art style.";
  const presetMap: Record<string, string> = {
    neutral: "Keep it mostly neutral, slight expressiveness only.",
    warm: "Use a warm, empathetic tone and gentle pacing.",
    excited: "Use energetic, upbeat intonation without shouting.",
    somber: "Use a calm, serious tone with slower pacing.",
    mysterious: "Use a subtle, curious tone with light suspense."
  };
  return `${base} ${preset ? (presetMap[preset] ?? "") : ""}`.trim();
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid payload", details: parsed.error.flatten() }), { status: 400 });
  }

  const openai = getOpenAIClient();
  const { text, mode, voice, emotionPreset } = parsed.data;

  const mp3 = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice,
    input: text,
    instructions: instructionsFor(mode, emotionPreset)
    // Note: "speed" support depends on model; keep instructions-only for portability.
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  return new Response(buffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store"
    }
  });
}
