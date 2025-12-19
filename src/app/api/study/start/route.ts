import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const participantId = typeof body.participantId === "string" ? body.participantId : undefined;

  const id = uuidv4();
  const ua = req.headers.get("user-agent") ?? undefined;
  const locale = req.headers.get("accept-language") ?? undefined;

  await prisma.studySession.create({
    data: { id, participantId, userAgent: ua, locale }
  });

  return NextResponse.json({ sessionId: id });
}
