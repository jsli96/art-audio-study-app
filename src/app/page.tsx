"use client";

import Image from "next/image";
import React, { useMemo, useRef, useState } from "react";
import { AudioPlayer } from "@/components/AudioPlayer";
import { Likert } from "@/components/Likert";

type DescribeOut = { description: string; styleHints: string[]; safetyNotes?: string };

const EXAMPLE_ARTS = [
  // Update filenames to match your `public/arts_example/` folder.
  { id: "ex1", label: "Guernica", src: "/arts_example/Guernica.jpg" },
  { id: "ex2", label: "The Harvesters", src: "/arts_example/theHarvesters.webp" },
  { id: "ex3", label: "The Japanese FootBridge", src: "/arts_example/theJapaneseFootbridge.jpg" },
  { id: "ex4", label: "The Starry Night", src: "/arts_example/theStarryNight.jpg" },
  { id: "ex5", label: "Under the Wave off Kanagawa", src: "/arts_example/underTheWaveOffKanagawa.jpg" }
];


const AZURE_HD_VOICES = [
  { value: "en-US-Jenny:DragonHDLatestNeural", label: "Jenny (HD) — female" },
  { value: "en-US-Aria:DragonHDLatestNeural", label: "Aria (HD) — female" },
  { value: "en-US-Ava3:DragonHDLatestNeural", label: "Ava3 (HD) — female" },
  { value: "en-US-Alloy:DragonHDLatestNeural", label: "Alloy (HD) — male" },
  { value: "en-US-Davis:DragonHDLatestNeural", label: "Davis (HD) — male" },
] as const;

type AzureHdVoice = (typeof AZURE_HD_VOICES)[number]["value"];

type Mark =
  | { kind: "emphasis"; start: number; end: number; level: "reduced" | "moderate" | "strong" }
  | { kind: "prosody"; start: number; end: number; pitch?: string; rate?: string; volume?: string }
  | { kind: "break"; at: number; timeMs: number };

function escapeXml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

async function fetchToDataUrl(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load example image: ${path}`);
  const blob = await res.blob();
  return blobToDataUrl(blob);
}

function buildSsmlFromTextAndMarks(opts: {
  text: string;
  voiceName: string;
  lang: string;
  marks: Mark[];
}) {
  const { text, voiceName, lang } = opts;

  // Sort marks and reject overlapping spans (MVP constraint to avoid broken nesting).
  const marks = [...opts.marks].sort((a, b) => {
    const sa = a.kind === "break" ? a.at : a.start;
    const sb = b.kind === "break" ? b.at : b.start;
    return sa - sb;
  });

  const spans = marks.filter(
    (m): m is Exclude<Mark, { kind: "break"; at: number; timeMs: number }> => m.kind !== "break"
  );
  for (let i = 0; i < spans.length - 1; i++) {
    if (spans[i].end > spans[i + 1].start) {
      throw new Error("Overlapping edits are not supported yet. Clear formatting and re-apply.");
    }
  }

  const breaksByPos = new Map<number, number[]>();
  for (const m of marks) {
    if (m.kind === "break") {
      if (!breaksByPos.has(m.at)) breaksByPos.set(m.at, []);
      breaksByPos.get(m.at)!.push(m.timeMs);
    }
  }

  let out = "";
  let cursor = 0;

  function emitBreaksAt(pos: number) {
    const arr = breaksByPos.get(pos);
    if (!arr?.length) return;
    for (const ms of arr) out += `<break time="${ms}ms"/>`;
  }

  for (const m of spans) {
    emitBreaksAt(cursor);
    out += escapeXml(text.slice(cursor, m.start));
    emitBreaksAt(m.start);

    const inner = escapeXml(text.slice(m.start, m.end));

    if (m.kind === "emphasis") {
      out += `<emphasis level="${m.level}">${inner}</emphasis>`;
    } else if (m.kind === "prosody") {
      const attrs: string[] = [];
      if (m.pitch) attrs.push(`pitch="${m.pitch}"`);
      if (m.rate) attrs.push(`rate="${m.rate}"`);
      if (m.volume) attrs.push(`volume="${m.volume}"`);
      out += attrs.length ? `<prosody ${attrs.join(" ")}>${inner}</prosody>` : inner;
    }

    cursor = m.end;
  }

  emitBreaksAt(cursor);
  out += escapeXml(text.slice(cursor));
  emitBreaksAt(text.length);

  return `<?xml version="1.0" encoding="utf-8"?>
<speak version="1.0"
  xmlns="http://www.w3.org/2001/10/synthesis"
  xmlns:mstts="https://www.w3.org/2001/mstts"
  xml:lang="${escapeXml(lang)}">
  <voice name="${escapeXml(voiceName)}">
    ${out}
  </voice>
</speak>`;
}

export default function Page() {
  const [participantId, setParticipantId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Image selection
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(EXAMPLE_ARTS[0]?.id ?? null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);

  // Describe
  const [describeLoading, setDescribeLoading] = useState(false);
  const [describeOut, setDescribeOut] = useState<DescribeOut | null>(null);

  // Condition 2 (Azure SSML)
  const [azureVoiceName, setAzureVoiceName] = useState<AzureHdVoice>(AZURE_HD_VOICES[0].value);
  const [ssmlBaseText, setSsmlBaseText] = useState(""); // plain text only
  const [ssmlMarks, setSsmlMarks] = useState<Mark[]>([]);
  const [showAdvancedSsml, setShowAdvancedSsml] = useState(false);

  // Condition 3 (OpenAI emotion+music) — keep if you still use it
  const [emotionPreset, setEmotionPreset] = useState<"neutral" | "warm" | "excited" | "somber" | "mysterious">("warm");

  // Responses
  const [ratingStyleComprehension, setRatingStyleComprehension] = useState<number | undefined>();
  const [ratingEmotionalFit, setRatingEmotionalFit] = useState<number | undefined>();
  const [ratingEnjoyment, setRatingEnjoyment] = useState<number | undefined>();
  const [freeText, setFreeText] = useState("");

  const descriptionText = describeOut?.description ?? "";

  const selectedExample = useMemo(() => {
    return EXAMPLE_ARTS.find((x) => x.id === selectedExampleId) ?? null;
  }, [selectedExampleId]);

  const effectivePreview = useMemo(() => {
    if (uploadPreviewUrl) return uploadPreviewUrl;
    if (!imageFile && selectedExample) return selectedExample.src;
    return null;
  }, [uploadPreviewUrl, imageFile, selectedExample]);

  const ssmlTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function startSession() {
    const res = await fetch("/api/study/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: participantId.trim() || undefined }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setSessionId(data.sessionId);
  }

  async function generateDescription() {
    setDescribeLoading(true);
    setDescribeOut(null);

    try {
      if (!sessionId) await startSession();

      let imageDataUrl: string | null = null;

      if (imageFile) {
        imageDataUrl = await blobToDataUrl(imageFile);
      } else if (selectedExample) {
        imageDataUrl = await fetchToDataUrl(selectedExample.src);
      }

      if (!imageDataUrl) {
        alert("Please select an example image or upload an image.");
        return;
      }

      const res = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, accessibilityFocus: true }),
      });
      if (!res.ok) throw new Error(await res.text());

      const data: DescribeOut = await res.json();
      setDescribeOut(data);

      // Auto-fill the plain-text SSML editor only if it is empty.
      setSsmlBaseText((prev) => (prev.trim() ? prev : data.description));
      setSsmlMarks([]); // reset formatting for a new description
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to generate description");
    } finally {
      setDescribeLoading(false);
    }
  }

  function getSelectionRange() {
    const el = ssmlTextareaRef.current;
    if (!el) return null;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) return null;
    return { start, end };
  }

  function addSpanMark(mark: Mark) {
    try {
      // Quick overlap prevention (matches build constraint)
      if (mark.kind !== "break") {
        for (const m of ssmlMarks) {
          if (m.kind === "break") continue;
          const overlap = !(mark.end <= m.start || mark.start >= m.end);
          if (overlap) {
            alert("Overlapping edits are not supported yet. Click 'Clear formatting' and re-apply.");
            return;
          }
        }
      }
      setSsmlMarks((prev) => [...prev, mark]);
    } catch (e: any) {
      alert(e?.message ?? "Failed to apply edit.");
    }
  }

  function addBreak(ms: number) {
    const el = ssmlTextareaRef.current;
    if (!el) return;
    const at = el.selectionStart ?? 0;
    setSsmlMarks((prev) => [...prev, { kind: "break", at, timeMs: ms }]);
  }

  async function submit() {
    if (!sessionId) {
      alert("No session. Generate a description first.");
      return;
    }
    const res = await fetch("/api/study/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        conditionA: "tts",
        conditionB: "emotion",
        conditionC: "emotion+music",
        ratingStyleComprehension,
        ratingEmotionalFit,
        ratingEnjoyment,
        freeText: freeText.trim() || undefined,
      }),
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    alert("Submitted. Thank you!");
    setRatingStyleComprehension(undefined);
    setRatingEmotionalFit(undefined);
    setRatingEnjoyment(undefined);
    setFreeText("");
  }

  const ssmlOverrideForSection2 = useMemo(() => {
    const base = (ssmlBaseText.trim() ? ssmlBaseText : descriptionText).trim();
    if (!base) return undefined;

    try {
      return buildSsmlFromTextAndMarks({
        text: base,
        voiceName: azureVoiceName,
        lang: "en-US",
        marks: ssmlMarks,
      });
    } catch (e: any) {
      console.error(e);
      return undefined; // fallback: server can still build from text if needed
    }
  }, [ssmlBaseText, descriptionText, azureVoiceName, ssmlMarks]);

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <h1>Art Audio Study (Prototype)</h1>
        <div className="small">
          Flow: image → AI text description → (1) Baseline system TTS (2) Azure SSML intonation editor (3) Intonation + music.
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div style={{ minWidth: 260, flex: 1 }}>
            <label>Participant ID (optional)</label>
            <input value={participantId} onChange={(e) => setParticipantId(e.target.value)} placeholder="e.g., P001" />
          </div>
          <div className="small">
            Session: <kbd>{sessionId ?? "not started"}</kbd>
          </div>
        </div>

        <hr />

        <h2>Stimulus image</h2>
        <div className="small">Choose one of the provided examples, or upload your own image.</div>

        <div style={{ marginTop: 10 }}>
          <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
            Example images
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {EXAMPLE_ARTS.map((ex) => (
              <button
                key={ex.id}
                type="button"
                className={selectedExampleId === ex.id && !imageFile ? "" : "secondary"}
                onClick={() => {
                  setSelectedExampleId(ex.id);
                  setImageFile(null);
                  if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
                  setUploadPreviewUrl(null);
                }}
                style={{ textAlign: "left" }}
              >
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: 120,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <Image src={ex.src} alt={ex.label} fill style={{ objectFit: "cover" }} unoptimized />
                </div>
                <div style={{ marginTop: 8, fontWeight: 700 }}>{ex.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
            Or upload an image
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setImageFile(f);
              if (f) {
                const url = URL.createObjectURL(f);
                setUploadPreviewUrl(url);
              } else {
                setUploadPreviewUrl(null);
              }
            }}
          />
          {imageFile && (
            <div className="row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setImageFile(null);
                  if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
                  setUploadPreviewUrl(null);
                }}
              >
                Clear upload and use examples
              </button>
            </div>
          )}
        </div>

        {effectivePreview && (
          <div style={{ marginTop: 12 }}>
            <div className="small" style={{ marginBottom: 6 }}>
              Preview
            </div>
            <div
              style={{
                position: "relative",
                width: "100%",
                height: 320,
                borderRadius: 14,
                overflow: "hidden",
                border: "1px solid #e5e7eb",
              }}
            >
              <Image src={effectivePreview} alt="Selected artwork" fill style={{ objectFit: "contain" }} unoptimized />
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={generateDescription} disabled={describeLoading}>
            {describeLoading ? "Generating description..." : describeOut ? "Regenerate description" : "Generate description"}
          </button>
        </div>

        {describeOut && (
          <div style={{ marginTop: 12 }}>
            <hr />
            <h2>AI Description</h2>
            <div style={{ whiteSpace: "pre-wrap" }}>{describeOut.description}</div>

            {describeOut.styleHints?.length > 0 && (
              <>
                <div className="small" style={{ marginTop: 10, fontWeight: 700 }}>
                  Style hints
                </div>
                <ul>
                  {describeOut.styleHints.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </>
            )}

            {describeOut.safetyNotes && <div className="small" style={{ marginTop: 10 }}>Note: {describeOut.safetyNotes}</div>}
          </div>
        )}
      </div>

      <div className="grid">
        <AudioPlayer title="1) Baseline system TTS" descriptionText={descriptionText} mode="tts" />

        <AudioPlayer
          title="2) Emotional Intonation (Azure SSML)"
          descriptionText={descriptionText}
          mode="emotion"
          useAzureForEmotion={true}
          ssmlOverride={ssmlOverrideForSection2}
          azureVoiceName={azureVoiceName}
          headerExtra={
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label>Azure HD voice</label>
                <select value={azureVoiceName} onChange={(e) => setAzureVoiceName(e.target.value as AzureHdVoice)}>
                  {AZURE_HD_VOICES.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <div className="small">
                  This voice selection is applied immediately to the generated SSML used by Condition 2.
                </div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label>Intonation editor (plain text)</label>
                <textarea
                  ref={ssmlTextareaRef}
                  rows={6}
                  value={ssmlBaseText}
                  onChange={(e) => {
                    setSsmlBaseText(e.target.value);
                    setSsmlMarks([]); // text edits invalidate ranges; reset formatting
                  }}
                  placeholder="Click 'Generate description' to populate this box, then select words and apply edits below."
                />
                <div className="small">
                  Select words, then click an edit button. Editing the text clears formatting to keep indices consistent.
                </div>
              </div>

              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const r = getSelectionRange();
                    if (!r) return alert("Select some text first.");
                    addSpanMark({ kind: "emphasis", start: r.start, end: r.end, level: "moderate" });
                  }}
                >
                  Emphasis
                </button>

                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const r = getSelectionRange();
                    if (!r) return alert("Select some text first.");
                    addSpanMark({ kind: "prosody", start: r.start, end: r.end, pitch: "+20%" });
                  }}
                >
                  Pitch +20%
                </button>

                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const r = getSelectionRange();
                    if (!r) return alert("Select some text first.");
                    addSpanMark({ kind: "prosody", start: r.start, end: r.end, pitch: "-20%" });
                  }}
                >
                  Pitch −20%
                </button>

                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const r = getSelectionRange();
                    if (!r) return alert("Select some text first.");
                    addSpanMark({ kind: "prosody", start: r.start, end: r.end, rate: "+15%" });
                  }}
                >
                  Rate +15%
                </button>

                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const r = getSelectionRange();
                    if (!r) return alert("Select some text first.");
                    addSpanMark({ kind: "prosody", start: r.start, end: r.end, rate: "-15%" });
                  }}
                >
                  Rate −15%
                </button>

                <button type="button" className="secondary" onClick={() => addBreak(200)}>
                  Pause 200ms
                </button>

                <button type="button" className="secondary" onClick={() => setSsmlMarks([])}>
                  Clear formatting
                </button>

                <button type="button" className="secondary" onClick={() => setShowAdvancedSsml((v) => !v)}>
                  {showAdvancedSsml ? "Hide SSML" : "Show SSML"}
                </button>
              </div>

              {showAdvancedSsml && (
                <div style={{ display: "grid", gap: 6 }}>
                  <label>Generated SSML (read-only)</label>
                  <textarea rows={8} readOnly value={ssmlOverrideForSection2 ?? ""} />
                  <div className="small">For researcher debugging only.</div>
                </div>
              )}
            </div>
          }
        />

        <AudioPlayer
          title="3) Intonation + Music"
          descriptionText={descriptionText}
          mode="emotion_music"
          emotionPreset={emotionPreset}
          headerExtra={
            <div style={{ display: "grid", gap: 6 }}>
              <label>Emotion preset (Condition 3 only)</label>
              <select value={emotionPreset} onChange={(e) => setEmotionPreset(e.target.value as any)}>
                <option value="neutral">neutral</option>
                <option value="warm">warm</option>
                <option value="excited">excited</option>
                <option value="somber">somber</option>
                <option value="mysterious">mysterious</option>
              </select>
              <div className="small">This does not affect Condition 2 (Azure SSML).</div>
            </div>
          }
        />
      </div>

      {/* <div className="card">
        <h2>Participant response</h2>
        <div className="small">These are example metrics. Replace with your study’s validated scales if needed.</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 10 }}>
          <Likert
            label="How well did the audio help you understand the artwork’s style?"
            value={ratingStyleComprehension}
            onChange={setRatingStyleComprehension}
          />
          <Likert
            label="How well did the audio’s emotion match the artwork’s style?"
            value={ratingEmotionalFit}
            onChange={setRatingEmotionalFit}
          />
          <Likert
            label="How enjoyable was the audio experience overall?"
            value={ratingEnjoyment}
            onChange={setRatingEnjoyment}
          />

          <div className="card" style={{ padding: 12 }}>
            <label>Open-ended feedback (optional)</label>
            <textarea
              rows={4}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="What did the audio help you notice or feel?"
            />
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={submit} disabled={!sessionId}>
            Submit
          </button>
          <div className="small">Tip: for multiple trials per participant, keep the session and Submit after each stimulus.</div>
        </div>
      </div> */}

      <div className="small">
        Required setup: place the 5 example images in <kbd>public/arts_example/</kbd>. Update filenames in <kbd>EXAMPLE_ARTS</kbd> if needed.
      </div>
    </main>
  );
}
