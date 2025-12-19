import { NextResponse } from "next/server";
import { z } from "zod";
import { getOpenAIClient } from "@/lib/openai";

export const runtime = "nodejs"; // ensures Buffer available on Vercel

const BodySchema = z.object({
  imageUrl: z.string().url().optional(),
  imageDataUrl: z.string().startsWith("data:image/").optional(),
  // Optional: for study context
  accessibilityFocus: z.boolean().optional()
}).refine((v) => !!v.imageUrl || !!v.imageDataUrl, "Provide imageUrl or imageDataUrl.");

function buildPrompt(accessibilityFocus: boolean) {
  return [
    "Task: describe the visual artwork in a way that is useful for a blind or sighted participant.",
    "Output MUST be valid JSON with keys:",
    "  description: string (2-4 sentences, concrete, neutral, no speculation).",
    "  styleHints: array of 3-6 short phrases describing style-related qualities (e.g., color palette, brushwork, mood, composition, era cues).",
    "  safetyNotes: optional string if there is potentially sensitive content.",
    "Avoid guessing the artist or title unless it is obvious from visible text.",
    accessibilityFocus ? "Prioritize non-visual sensory metaphors only when grounded in the image." : ""
  ].filter(Boolean).join("\n");
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const openai = getOpenAIClient();
  const { imageUrl, imageDataUrl, accessibilityFocus } = parsed.data;

  // Using Responses API image input format.
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: buildPrompt(!!accessibilityFocus) },
        { type: "input_image", image_url: imageUrl ?? imageDataUrl! }
      ]
    }],
    text: { format: { type: "json_object" } }
  });

  // response.output_text is a convenience accessor in the SDK
  let out: any = null;
  try {
    out = JSON.parse((response as any).output_text ?? "{}");
  } catch {
    out = { description: (response as any).output_text ?? "", styleHints: [] };
  }

  if (typeof out.description !== "string") out.description = "";
  if (!Array.isArray(out.styleHints)) out.styleHints = [];

  return NextResponse.json(out);
}
