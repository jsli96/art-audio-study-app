import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const SubmitSchema = z.object({
  sessionId: z.string().min(1),
  conditionA: z.literal("tts"),
  conditionB: z.literal("emotion"),
  conditionC: z.literal("emotion+music"),
  ratingStyleComprehension: z.number().int().min(1).max(7).optional(),
  ratingEmotionalFit: z.number().int().min(1).max(7).optional(),
  ratingEnjoyment: z.number().int().min(1).max(7).optional(),
  freeText: z.string().max(2000).optional()
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = SubmitSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const id = uuidv4();
  await prisma.trial.create({
    data: { id, ...parsed.data, conditionC: "emotion+music" }
  });

  return NextResponse.json({ ok: true, trialId: id });
}
