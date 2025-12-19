"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  descriptionText: string;
  mode: "tts" | "emotion" | "emotion_music";

  // Used by Section 3 (OpenAI route). Section 2 (Azure) should ignore this.
  emotionPreset?: "neutral" | "warm" | "excited" | "somber" | "mysterious";

  headerExtra?: ReactNode;

  // Section 2: Azure SSML
  useAzureForEmotion?: boolean; // default true
  ssmlOverride?: string; // full SSML document (optional)
  azureVoiceName?: string; // e.g., en-US-Davis:DragonHDLatestNeural
};

export function AudioPlayer({
  title,
  descriptionText,
  mode,
  emotionPreset = "neutral",
  headerExtra,
  useAzureForEmotion = true,
  ssmlOverride,
  azureVoiceName,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Simple “music bed” placeholder using WebAudio oscillators for MVP.
  const [musicOn, setMusicOn] = useState(false);
  const musicCtxRef = useRef<AudioContext | null>(null);
  const musicNodesRef = useRef<{ osc: OscillatorNode; gain: GainNode }[] | null>(null);

  async function generateAIVoice() {
    setLoading(true);

    // Revoke previous blob URL before generating a new one
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    try {
      // Section 2: Emotional intonation via Azure SSML
      if (mode === "emotion" && useAzureForEmotion) {
        const res = await fetch("/api/azure-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // If ssml is provided, server will use it verbatim.
            // If ssml is omitted, server should build plain SSML from text + voiceName.
            text: descriptionText,
            ssml: ssmlOverride?.trim() ? ssmlOverride : undefined,
            voiceName: azureVoiceName,
          }),
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
        body: JSON.stringify({ text: descriptionText, mode, emotionPreset }),
      });

      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to generate audio.");
    } finally {
      setLoading(false);
    }
  }

  function stopMusic() {
    if (musicNodesRef.current) {
      for (const n of musicNodesRef.current) {
        try {
          n.osc.stop();
        } catch {}
        try {
          n.osc.disconnect();
        } catch {}
        try {
          n.gain.disconnect();
        } catch {}
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

    // A gentle drone chord placeholder.
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
    if (mode === "emotion") return useAzureForEmotion ? "Azure SSML (word/phrase-level prosody control)." : "Emotional intonation (AI TTS).";
    return "Emotional intonation + background music (placeholder music bed in MVP).";
  }, [mode, useAzureForEmotion]);

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
              {loading ? "Generating..." : audioUrl ? "Regenerate voice" : "Generate voice"}
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

          {audioUrl && <audio ref={audioRef} src={audioUrl} controls style={{ width: "100%", marginTop: 10 }} />}
        </>
      )}

      <div className="small" style={{ marginTop: 10 }}>
        Disclosure: Condition 2 uses Azure Speech TTS (SSML). Condition 3 uses AI-generated TTS plus a placeholder music bed.
      </div>
    </div>
  );
}
