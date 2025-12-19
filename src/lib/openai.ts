import OpenAI from "openai";

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. Set it in .env.local (server-side only).");
  }
  return new OpenAI({ apiKey });
}
