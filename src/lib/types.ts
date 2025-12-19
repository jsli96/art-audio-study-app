export type AudioMode = "tts" | "emotion" | "emotion_music";

export type DescribeResult = {
  description: string;
  styleHints: string[];
  safetyNotes?: string;
};
