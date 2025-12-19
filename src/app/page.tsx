"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
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

export default function Page() {
  const [participantId, setParticipantId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Image inputs
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(EXAMPLE_ARTS[0]?.id ?? null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);

  const [describeLoading, setDescribeLoading] = useState(false);
  const [describeOut, setDescribeOut] = useState<DescribeOut | null>(null);

  const [emotionPreset, setEmotionPreset] = useState<"neutral"|"warm"|"excited"|"somber"|"mysterious">("warm");

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

  async function startSession() {
    const res = await fetch("/api/study/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: participantId.trim() || undefined })
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
        // Convert example image to data URL so the OpenAI API can ingest it.
        imageDataUrl = await fetchToDataUrl(selectedExample.src);
      }

      if (!imageDataUrl) {
        alert("Please select an example image or upload an image.");
        return;
      }

      const res = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, accessibilityFocus: true })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDescribeOut(data);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to generate description");
    } finally {
      setDescribeLoading(false);
    }
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
        freeText: freeText.trim() || undefined
      })
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    alert("Submitted. Thank you!");
    // Reset trial responses but keep sessionId for multiple trials if desired.
    setRatingStyleComprehension(undefined);
    setRatingEmotionalFit(undefined);
    setRatingEnjoyment(undefined);
    setFreeText("");
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <h1>Art Audio Study (Prototype)</h1>
        <div className="small">
        Thanks for participating in the study! This study is about how audio conveys visual art style. 
        In this page, you can <strong>upload an image</strong> or enter the <strong>choose an exmple image</strong> and then generate three audio clips that are generated from the image.
          <ul>
            <li>The first audio clip is generated from the text description of the image.</li>
            <li>The second audio clip is generated from the emotional intonation of the text description.</li>
            <li>The third audio clip is generated from the emotional intonation of the text description and the music bed.</li>
          </ul>           
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

        <h2>Example Art Images</h2>
        <div className="small">Choose one of the provided examples, or upload your own image.</div>

        <div style={{ marginTop: 10 }}>
          <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Example images</div>
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
                <div style={{ position: "relative", width: "100%", height: 120, borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb" }}>
                  <Image src={ex.src} alt={ex.label} fill style={{ objectFit: "cover" }} unoptimized />
                </div>
                <div style={{ marginTop: 8, fontWeight: 700 }}>{ex.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Or upload an image</div>
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
            <div className="small" style={{ marginBottom: 6 }}>Preview</div>
            <div style={{ position: "relative", width: "100%", height: 320, borderRadius: 14, overflow: "hidden", border: "1px solid #e5e7eb" }}>
              <Image src={effectivePreview} alt="Selected artwork" fill style={{ objectFit: "contain" }} unoptimized />
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={generateDescription} disabled={describeLoading}>
            {describeLoading ? "Generating description..." : (describeOut ? "Regenerate description" : "Generate description")}
          </button>
        </div>

        {describeOut && (
          <div style={{ marginTop: 12 }}>
            <hr />
            <h2>AI Description</h2>
            <div style={{ whiteSpace: "pre-wrap" }}>{describeOut.description}</div>
            {describeOut.styleHints?.length > 0 && (
              <>
                <div className="small" style={{ marginTop: 10, fontWeight: 700 }}>Style hints</div>
                <ul>
                  {describeOut.styleHints.map((s, idx) => <li key={idx}>{s}</li>)}
                </ul>
              </>
            )}
            {describeOut.safetyNotes && (
              <div className="small" style={{ marginTop: 10 }}>
                Note: {describeOut.safetyNotes}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid">
        <AudioPlayer title="1) Baseline system TTS" descriptionText={descriptionText} mode="tts" />
        <AudioPlayer
          title="2) Emotional Intonation"
          descriptionText={descriptionText}
          mode="emotion"
          emotionPreset={emotionPreset}
          headerExtra={
            <div style={{ display: "grid", gap: 6 }}>
              <label>Emotion selection</label>
              <select value={emotionPreset} onChange={(e) => setEmotionPreset(e.target.value as any)}>
                <option value="neutral">neutral</option>
                <option value="warm">warm</option>
                <option value="excited">excited</option>
                <option value="somber">somber</option>
                <option value="mysterious">mysterious</option>
              </select>
              <div className="small">
                This preset controls both the Emotional Intonation in this section.
              </div>
            </div>
          }
        />
        <AudioPlayer title="3) Intonation + Music" descriptionText={descriptionText} mode="emotion_music" emotionPreset={emotionPreset} />
      </div>

      {/* <div className="card">
        <h2>Participant response</h2>
        <div className="small">These are example metrics. You can replace with your study’s validated scales.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 10 }}>
          <Likert label="How well did the audio help you understand the artwork’s style?" value={ratingStyleComprehension} onChange={setRatingStyleComprehension} />
          <Likert label="How well did the audio’s emotion match the artwork’s style?" value={ratingEmotionalFit} onChange={setRatingEmotionalFit} />
          <Likert label="How enjoyable was the audio experience overall?" value={ratingEnjoyment} onChange={setRatingEnjoyment} />
          <div className="card" style={{ padding: 12 }}>
            <label>Open-ended feedback (optional)</label>
            <textarea rows={4} value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="What did the audio help you notice or feel?" />
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={submit} disabled={!sessionId}>Submit</button>
          <div className="small">Tip: for multiple trials per participant, keep the session and call Submit after each stimulus.</div>
        </div>
      </div> */}

      <div className="small">
        Required setup: move your 5 example images into <kbd>public/arts_example/</kbd> so they can be loaded at <kbd>/arts_example/…</kbd>. Update the filenames in <kbd>EXAMPLE_ARTS</kbd> if needed.
      </div>
    </main>
  );

  // return (
  //   <main style={{ display: "flex", flexDirection: "column", gap: 16 }}>
  //     <div className="card">
  //       <h1>Art Audio Study (Prototype)</h1>
  //       <div className="small">      
  //       </div>

  //       <div className="row" style={{ marginTop: 10 }}>
  //         <div style={{ minWidth: 260, flex: 1 }}>
  //           <label>Participant ID (optional)</label>
  //           <input value={participantId} onChange={(e) => setParticipantId(e.target.value)} placeholder="e.g., P001" />
  //         </div>

  //         <div style={{ minWidth: 260, flex: 2 }}>
  //           <label>Upload image (optional)</label>
  //           <input
  //             type="file"
  //             accept="image/*"
  //             onChange={(e) => {
  //               const f = e.target.files?.[0] ?? null;
  //               setImageFile(f);
  //               if (f) setImageUrl("");
  //             }}
  //           />
  //         </div>
          
  //         <div style={{ minWidth: 260, flex: 1 }}>
  //           <label>Image URL (optional)</label>
  //           <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
  //         </div>
  //       </div>

  //       <div className="row" style={{ marginTop: 10 }}>
  //         <button onClick={generateDescription} disabled={describeLoading}>
  //           {describeLoading ? "Generating description..." : (describeOut ? "Regenerate description" : "Generate description")}
  //         </button>

  //         <div className="small">
  //           Session: <kbd>{sessionId ?? "not started"}</kbd>
  //         </div>

  //         <div style={{ marginLeft: "auto", minWidth: 260 }}>
  //           <label>Emotion preset</label>
  //           <select value={emotionPreset} onChange={(e) => setEmotionPreset(e.target.value as any)}>
  //             <option value="neutral">neutral</option>
  //             <option value="warm">warm</option>
  //             <option value="excited">excited</option>
  //             <option value="somber">somber</option>
  //             <option value="mysterious">mysterious</option>
  //           </select>
  //         </div>
  //       </div>

  //       {effectivePreview && (
  //         <div style={{ marginTop: 12 }}>
  //           <div className="small" style={{ marginBottom: 6 }}>Preview</div>
  //           <div style={{ position: "relative", width: "100%", height: 320, borderRadius: 14, overflow: "hidden", border: "1px solid #e5e7eb" }}>
  //             {/* next/image requires proper remote config; for data URLs, unoptimized is fine */}
  //             <Image src={effectivePreview} alt="Uploaded or linked artwork" fill style={{ objectFit: "contain" }} unoptimized />
  //           </div>
  //         </div>
  //       )}

  //       {describeOut && (
  //         <div style={{ marginTop: 12 }}>
  //           <hr />
  //           <h2>AI Description</h2>
  //           <div style={{ whiteSpace: "pre-wrap" }}>{describeOut.description}</div>
  //           {describeOut.styleHints?.length > 0 && (
  //             <>
  //               <div className="small" style={{ marginTop: 10, fontWeight: 700 }}>Style hints</div>
  //               <ul>
  //                 {describeOut.styleHints.map((s, idx) => <li key={idx}>{s}</li>)}
  //               </ul>
  //             </>
  //           )}
  //           {describeOut.safetyNotes && (
  //             <div className="small" style={{ marginTop: 10 }}>
  //               Note: {describeOut.safetyNotes}
  //             </div>
  //           )}
  //         </div>
  //       )}
  //     </div>

  //     <div className="grid">
  //       <AudioPlayer title="1) Text-to-Speech (TTS)" descriptionText={descriptionText} mode="tts" />
  //       <AudioPlayer title="2) Emotional Intonation" descriptionText={descriptionText} mode="emotion" emotionPreset={emotionPreset} />
  //       <AudioPlayer title="3) Intonation + Music" descriptionText={descriptionText} mode="emotion_music" emotionPreset={emotionPreset} />
  //     </div>

  //     <div className="card">
  //       <h2>Participant response</h2>
  //       <div className="small">These are example metrics. You can replace with your study’s validated scales.</div>
  //       <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 10 }}>
  //         <Likert label="How well did the audio help you understand the artwork’s style?" value={ratingStyleComprehension} onChange={setRatingStyleComprehension} />
  //         <Likert label="How well did the audio’s emotion match the artwork’s style?" value={ratingEmotionalFit} onChange={setRatingEmotionalFit} />
  //         <Likert label="How enjoyable was the audio experience overall?" value={ratingEnjoyment} onChange={setRatingEnjoyment} />
  //         <div className="card" style={{ padding: 12 }}>
  //           <label>Open-ended feedback (optional)</label>
  //           <textarea rows={4} value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="What did the audio help you notice or feel?" />
  //         </div>
  //       </div>
  //       <div className="row" style={{ marginTop: 10 }}>
  //         <button onClick={submit} disabled={!sessionId}>Submit</button>
  //         <div className="small">Tip: for multiple trials per participant, keep the session and call Submit after each stimulus.</div>
  //       </div>
  //     </div>

  //     <div className="small">
  //       Prototype notes: the “music bed” is a placeholder (sine-wave drone) so we can finalize the study flow now and swap in a real music generator later.
  //     </div>
  //   </main>
  // );
}
