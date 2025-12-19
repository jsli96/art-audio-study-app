import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  text: z.string().optional(),
  ssml: z.string().optional(), // full SSML document
  voiceName: z.string().optional(), // e.g., en-US-JaneNeural
  outputFormat: z.string().optional(), // e.g., audio-24khz-48kbitrate-mono-mp3
  lang: z.string().optional() // e.g., en-US
});

function escapeXml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildSsmlFromText(opts: { text: string; voiceName: string; lang: string; preset?: string }) {
  const preset = opts.preset ?? "warm";
  // Simple mapping; you can tune these for your study.
  const prosodyAttrsByPreset: Record<string, string> = {
    neutral: 'rate="0%" pitch="medium"',
    warm: 'rate="-5%" pitch="+5%"',
    excited: 'rate="+15%" pitch="+20%"',
    somber: 'rate="-10%" pitch="-10%" volume="-10%"',
    mysterious: 'rate="-5%" pitch="+10%" volume="-15%"'
  };
  const prosodyAttrs = prosodyAttrsByPreset[preset] ?? prosodyAttrsByPreset.warm;

  const safe = escapeXml(opts.text);

  return `<?xml version="1.0" encoding="utf-8"?>
<speak version="1.0"
  xmlns="http://www.w3.org/2001/10/synthesis"
  xmlns:mstts="https://www.w3.org/2001/mstts"
  xml:lang="${opts.lang}">
  <voice name="${opts.voiceName}">
    <prosody ${prosodyAttrs}>${safe}</prosody>
  </voice>
</speak>`;
}

export async function POST(req: Request) {
  const speechKey = process.env.SPEECH_KEY || process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.SPEECH_REGION || process.env.AZURE_SPEECH_REGION;

  if (!speechKey || !speechRegion) {
    return new NextResponse("Missing SPEECH_KEY / SPEECH_REGION (Azure Speech).", { status: 500 });
  }

  const raw = await req.json().catch(() => ({}));
  const body = BodySchema.safeParse(raw);
  if (!body.success) {
    return new NextResponse(body.error.message, { status: 400 });
  }

  const voiceName = (body.data.voiceName ?? "en-US-JaneNeural").trim();
  const outputFormat = (body.data.outputFormat ?? "audio-24khz-48kbitrate-mono-mp3").trim();
  const lang = (body.data.lang ?? "en-US").trim();

  let ssml = (body.data.ssml ?? "").trim();
  if (!ssml) {
    const text = (body.data.text ?? "").trim();
    if (!text) return new NextResponse("Missing text or ssml", { status: 400 });

    const preset = req.headers.get("x-emotion-preset") ?? "warm";
    ssml = buildSsmlFromText({ text, voiceName, lang, preset });
  }

  const endpoint = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": speechKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": outputFormat,
      "User-Agent": "art-audio-study-app"
    },
    body: ssml
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return new NextResponse(`Azure TTS failed (${res.status}): ${err || res.statusText}`, { status: 502 });
  }

  const audio = await res.arrayBuffer();
  return new NextResponse(audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store"
    }
  });
}
