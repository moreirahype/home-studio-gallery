import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { unauthorized } from "@/lib/http";
import { buildGenerationPrompts } from "@/lib/prompt-builder";
import { safeCompare } from "@/lib/security";

const payloadSchema = z.object({
  contactId: z.string().min(1).optional(),
  contactName: z.string().min(1).optional(),
  phone: z.string().min(8).optional(),
  sourceImageUrl: z.string().optional(),
  foto_cliente: z.string().optional(),
  contextFinal: z.string().optional(),
  contexto_final: z.string().optional(),
  nicheId: z.string().min(1).optional().default("geral"),
  nicho: z.string().min(1).optional(),
  includedPhotos: z.coerce.number().int().min(1).max(20).optional().default(1),
  paidAmount: z.coerce.number().positive().optional().default(4.9),
  receiptId: z.string().min(1).optional(),
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
  const isTestMode = process.env.TEST_MODE === "true";
  const receivedSourceImage =
    parsed.data.sourceImageUrl?.trim() || parsed.data.foto_cliente?.trim();
  const receivedContext =
    parsed.data.contextFinal?.trim() || parsed.data.contexto_final?.trim();
  const sourceImageUrl =
    receivedSourceImage ||
    (isTestMode
      ? "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=1200"
      : "");
  const contextFinal =
    receivedContext ||
    (isTestMode ? "Ensaio premium para homologação" : "");

  if (!sourceImageUrl || !URL.canParse(sourceImageUrl)) {
    return NextResponse.json(
      { ok: false, error: "foto_cliente precisa conter uma URL pública válida." },
      { status: 400 },
    );
  }

  if (contextFinal.length < 3) {
    return NextResponse.json(
      { ok: false, error: "contexto_final precisa estar preenchido." },
      { status: 400 },
    );
  }

  const nicheId = parsed.data.nicho ?? parsed.data.nicheId;
  const generationPrompts = buildGenerationPrompts(contextFinal);
  const galleryUrl = new URL(
    `/g/${isTestMode ? "demo" : galleryToken}`,
    appUrl,
  );

  if (isTestMode) {
    galleryUrl.searchParams.set(
      "paidAmount",
      String(parsed.data.paidAmount),
    );
    galleryUrl.searchParams.set(
      "includedPhotos",
      String(parsed.data.includedPhotos),
    );
    galleryUrl.searchParams.set("test", "1");
  }

  // TODO: persist the project, download sourceImageUrl and enqueue generationPrompts.
  return NextResponse.json({
    ok: true,
    projectId,
    status: "queued",
    galleryUrl: galleryUrl.toString(),
    testMode: isTestMode,
    includedPhotos: parsed.data.includedPhotos,
    generationPlan: {
      count: generationPrompts.length,
      nicheId,
      sourceImageUrl,
      contextFinal,
    },
  });
}
