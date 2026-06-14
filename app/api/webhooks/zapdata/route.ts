import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { unauthorized } from "@/lib/http";
import { safeCompare } from "@/lib/security";

const payloadSchema = z.object({
  contactId: z.string().min(1),
  contactName: z.string().min(1),
  phone: z.string().min(8),
  sourceImageUrl: z.string().url(),
  prompt: z.string().min(3),
  receiptId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");

  if (!safeCompare(secret, process.env.ZAPDATA_WEBHOOK_SECRET)) {
    return unauthorized();
  }

  const parsed = payloadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const projectId = randomUUID();
  const galleryToken = randomUUID().replaceAll("-", "");
  const appUrl = process.env.APP_URL ?? request.nextUrl.origin;

  // TODO: persist the project and enqueue 20 Kie.ai jobs.
  return NextResponse.json({
    ok: true,
    projectId,
    status: "queued",
    galleryUrl: `${appUrl}/g/${galleryToken}`,
  });
}
