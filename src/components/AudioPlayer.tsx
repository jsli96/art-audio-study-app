"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  title: string;
  descriptionText: string;
  mode: "tts" | "emotion" | "emotion_music";
  emotionPreset?: "neutral" | "warm" | "excited" | "somber" | "mysterious";
  headerExtra?: React.ReactNode;

  // Section 2: Azure SSML
  useAzureForEmotion?: boolean; // default true
  ssmlOverride?: string; // full SSML document (optional)
  azureVoiceName?: string; // e.g., en-US-JaneNeural
};

export function AudioPlayer({ title, descriptionText, mode, emotionPreset = "neutral", headerExtra, useAzureForEmotion = true, ssmlOverride, azureVoiceName }: Props) {
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Simple “music bed” placeholder using WebAudio oscillators for MVP.
  const [musicOn, setMusicOn] = useState(false);
  const musicCtxRef = useRef<AudioContext | null>(null);
  const musicNodesRef = useRef<{ osc: OscillatorNode; gain: GainNode }[] | null>(null);

  async function generateAIVoice() {
  setLoading(true);
  setAudioUrl(null);
  try {
    // Section 2: Emotional intonation via Azure SSML
    if (mode === "emotion" && useAzureForEmotion) {
      const res = await fetch("/api/azure-tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-emotion-preset": emotionPreset
        },
        body: JSON.stringify({
          text: descriptionText,
          ssml: ssmlOverride?.trim() ? ssmlOverride : undefined,
          voiceName: azureVoiceName
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      return;
    }

    // Default: OpenAI TTS route (used by Section 3; optionally also by Section 2 if you disable Azure)
    const res = await fetch("/api/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: descriptionText, mode, emotionPreset })
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
  } finally {
    setLoading(false);
  }
}
  function stopMusic() {
    if (musicNodesRef.current) {
      for (const n of musicNodesRef.current) {
        try { n.osc.stop(); } catch {}
        try { n.osc.disconnect(); } catch {}
        try { n.gain.disconnect(); } catch {}
      }
    }
    musicNodesRef.current = null;
    if (musicCtxRef.current) {
      musicCtxRef.current.close().catch(() => {});
      musicCtxRef.current = null;
    }
  }

  function startMusic() {
    stopMusic();
    const ctx = new AudioContext();
    musicCtxRef.current = ctx;

    // A gentle drone chord (A minor-ish) as placeholder.
    const freqs = [220, 261.63, 329.63];
    const nodes = freqs.map((f) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.value = 0.03;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      return { osc, gain };
    });
    musicNodesRef.current = nodes;
  }

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      stopMusic();
      // Stop any system speech if user navigates away
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "emotion_music") {
      stopMusic();
      setMusicOn(false);
      return;
    }
    if (musicOn) startMusic();
    else stopMusic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicOn, mode]);

  const subtitle = useMemo(() => {
    if (mode === "tts") return "Baseline system TTS (browser/OS default voice).";
    if (mode === "emotion") return useAzureForEmotion ? `Azure SSML (word-level prosody possible). Preset: ${emotionPreset}.` : `Emotional intonation preset: ${emotionPreset}.`;
    return "Emotional intonation + background music (placeholder music bed in MVP).";
  }, [mode, emotionPreset, useAzureForEmotion]);

  function speakSystemTTS() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("System TTS is not available in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(descriptionText);
    // Do not set u.voice => use system/browser default voice
    window.speechSynthesis.speak(u);
  }

  function stopSystemTTS() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
  }

  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="small">{subtitle}</div>
      {headerExtra ? <div style={{ marginTop: 10 }}>{headerExtra}</div> : null}

      {mode === "tts" ? (
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={speakSystemTTS} disabled={!descriptionText}>
            Speak (system)
          </button>
          <button className="secondary" onClick={stopSystemTTS}>
            Stop
          </button>
        </div>
      ) : (
        <>
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={generateAIVoice} disabled={loading || !descriptionText}>
              {loading ? "Generating..." : (audioUrl ? "Regenerate voice" : "Generate voice")}
            </button>
            {mode === "emotion_music" && (
              <button className="secondary" onClick={() => setMusicOn((v) => !v)}>
                {musicOn ? "Stop music bed" : "Play music bed"}
              </button>
            )}
            {audioUrl && (
              <button className="secondary" onClick={() => audioRef.current?.play()}>
                Play voice
              </button>
            )}
            {audioUrl && (
              <button className="secondary" onClick={() => audioRef.current?.pause()}>
                Pause
              </button>
            )}
          </div>

          {audioUrl && (
            <audio ref={audioRef} src={audioUrl} controls style={{ width: "100%", marginTop: 10 }} />
          )}
        </>
      )}

      <div className="small" style={{ marginTop: 10 }}>
        Disclosure: conditions 2 and 3 are AI-generated audio using ChatGPT-4o-mini-tts.
      </div>
    </div>
  );
}

// export function AudioPlayer({ title, descriptionText, mode, emotionPreset = "neutral" }: Props) {
//   const [loading, setLoading] = useState(false);
//   const [audioUrl, setAudioUrl] = useState<string | null>(null);
//   const audioRef = useRef<HTMLAudioElement | null>(null);

//   // --- System TTS state (baseline condition) ---
//   const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
//   const [voiceName, setVoiceName] = useState<string>("");
//   const [rate, setRate] = useState<number>(1.0);
//   const [pitch, setPitch] = useState<number>(1.0);

//   useEffect(() => {
//     if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

//     const loadVoices = () => {
//       const v = window.speechSynthesis.getVoices();
//       setVoices(v);
//       // pick a default voice once
//       if (!voiceName && v.length > 0) setVoiceName(v[0].name);
//     };

//     loadVoices();
//     window.speechSynthesis.onvoiceschanged = loadVoices;

//     return () => {
//       window.speechSynthesis.onvoiceschanged = null;
//       // stop any speech if user navigates
//       window.speechSynthesis.cancel();
//     };
//   }, [voiceName]);

//   function speakSystemTTS() {
//     if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
//     window.speechSynthesis.cancel();

//     const u = new SpeechSynthesisUtterance(descriptionText);
//     u.rate = rate;
//     u.pitch = pitch;

//     window.speechSynthesis.speak(u);
//   }

//   function stopSystemTTS() {
//     if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
//     window.speechSynthesis.cancel();
//   }

//   // --- AI voice generation (emotion / emotion_music) ---
//   async function generateAIVoice() {
//     setLoading(true);
//     setAudioUrl(null);
//     try {
//       const res = await fetch("/api/speech", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ text: descriptionText, mode, emotionPreset })
//       });
//       if (!res.ok) throw new Error(await res.text());
//       const blob = await res.blob();
//       const url = URL.createObjectURL(blob);
//       setAudioUrl(url);
//     } finally {
//       setLoading(false);
//     }
//   }

//   useEffect(() => {
//     return () => {
//       if (audioUrl) URL.revokeObjectURL(audioUrl);
//     };
//   }, [audioUrl]);

//   const subtitle = useMemo(() => {
//     if (mode === "tts") return "Baseline system TTS (browser/OS voice).";
//     if (mode === "emotion") return useAzureForEmotion ? `Azure SSML (word-level prosody possible). Preset: ${emotionPreset}.` : `Emotional intonation preset: ${emotionPreset}.`;
//     return "Emotional intonation + background music.";
//   }, [mode, emotionPreset, useAzureForEmotion]);





//   return (
//     <div className="card">
//       <h2>{title}</h2>
//       <div className="small">{subtitle}</div>

//       {mode === "tts" ? (
//         <>
//           <div className="row" style={{ marginTop: 10 }}>
//             <button onClick={speakSystemTTS} disabled={!descriptionText}>
//               Speak (system)
//             </button>
//             <button className="secondary" onClick={stopSystemTTS}>
//               Stop
//             </button>
//           </div>

//           <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
//             {/* <div>
//               <label>System voice</label>
//               <select value={voiceName} onChange={(e) => setVoiceName(e.target.value)}>
//                 {voices.map((v) => (
//                   <option key={v.name} value={v.name}>
//                     {v.name}{v.lang ? ` (${v.lang})` : ""}
//                   </option>
//                 ))}
//               </select>
//               <div className="small">
//                 Note: voice availability depends on the participant’s OS/browser settings.
//               </div>
//             </div> */}

//             <div className="row">
//               <div style={{ flex: 1 }}>
//                 <label>Rate</label>
//                 <input
//                   type="range"
//                   min="0.6"
//                   max="1.4"
//                   step="0.1"
//                   value={rate}
//                   onChange={(e) => setRate(Number(e.target.value))}
//                 />
//                 <div className="small">{rate.toFixed(1)}</div>
//               </div>

//               <div style={{ flex: 1 }}>
//                 <label>Pitch</label>
//                 <input
//                   type="range"
//                   min="0.6"
//                   max="1.4"
//                   step="0.1"
//                   value={pitch}
//                   onChange={(e) => setPitch(Number(e.target.value))}
//                 />
//                 <div className="small">{pitch.toFixed(1)}</div>
//               </div>
//             </div>
//           </div>
//         </>
//       ) : (
//         <>
//           <div className="row" style={{ marginTop: 10 }}>
//             <button onClick={generateAIVoice} disabled={loading || !descriptionText}>
//               {loading ? "Generating..." : (audioUrl ? "Regenerate voice" : "Generate voice")}
//             </button>
//             {audioUrl && (
//               <button className="secondary" onClick={() => audioRef.current?.play()}>
//                 Play voice
//               </button>
//             )}
//             {audioUrl && (
//               <button className="secondary" onClick={() => audioRef.current?.pause()}>
//                 Pause
//               </button>
//             )}
//           </div>

//           {audioUrl && (
//             <audio ref={audioRef} src={audioUrl} controls style={{ width: "100%", marginTop: 10 }} />
//           )}
//         </>
//       )}

//       <div className="small" style={{ marginTop: 10 }}>
//         Disclosure: condition 2 uses Azure TTS (SSML) when enabled; condition 3 uses AI-generated audio + music bed placeholder.
//       </div>
//     </div>
//   );
// }
