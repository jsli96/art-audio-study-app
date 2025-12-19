import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  text?: string;          // plain text input (optional)
  ssml?: string;          // full SSML document (recommended)
  voiceName?: string;     // e.g., en-US-JennyNeural
  outputFormat?: string;  // e.g., audio-24khz-48kbitrate-mono-mp3
  lang?: string;          // e.g., en-US
};

function escapeXml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildPlainSsml(opts: { text: string; voiceName: string; lang: string }) {
  // “Natural/default” speaking: no <prosody>, no <mstts:express-as>
  const safeText = escapeXml(opts.text);
  return `<?xml version="1.0" encoding="utf-8"?>
<speak version="1.0"
  xmlns="http://www.w3.org/2001/10/synthesis"
  xmlns:mstts="https://www.w3.org/2001/mstts"
  xml:lang="${opts.lang}">
  <voice name="${opts.voiceName}">
    ${safeText}
  </voice>
</speak>`;
}

export async function POST(req: Request) {
  const speechKey = process.env.SPEECH_KEY || process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.SPEECH_REGION || process.env.AZURE_SPEECH_REGION;

  if (!speechKey || !speechRegion) {
    return new NextResponse(
      "Missing SPEECH_KEY / SPEECH_REGION environment variables (Azure Speech).",
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;

  const voiceName = (body.voiceName ?? "en-US-JennyNeural").trim();
  const outputFormat = (body.outputFormat ?? "audio-24khz-48kbitrate-mono-mp3").trim();
  const lang = (body.lang ?? "en-US").trim();

  let ssml = (body.ssml ?? "").trim();

  // SSML-first: if SSML not provided, build a plain SSML wrapper from text.
  if (!ssml) {
    const text = (body.text ?? "").trim();
    if (!text) return new NextResponse("Missing ssml or text", { status: 400 });
    ssml = buildPlainSsml({ text, voiceName, lang });
  }

  const endpoint = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": speechKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": outputFormat,
      "User-Agent": "art-audio-study-app",
    },
    body: ssml,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return new NextResponse(
      `Azure TTS failed (${res.status}): ${errText || res.statusText}`,
      { status: 502 }
    );
  }

  const audio = await res.arrayBuffer();
  return new NextResponse(audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
