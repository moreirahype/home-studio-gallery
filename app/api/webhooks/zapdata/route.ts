import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { unauthorized } from "@/lib/http";
import { buildGenerationPrompts } from "@/lib/prompt-builder";
import { safeCompare } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

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
  paidAmount: z.coerce.number().positive().optional().default(7.9),
  generationCount: z.coerce.number().int().min(1).max(20).optional().default(15),
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
  const generationPrompts = buildGenerationPrompts(contextFinal).slice(
    0,
    parsed.data.generationCount,
  );
  const galleryUrl = new URL(
    `/g/${galleryToken}`,
    appUrl,
  );

  if (isTestMode) {
    galleryUrl.searchParams.set("test", "1");
  }

  const supabase = getSupabaseAdmin();
  const projectPayload = {
    id: projectId,
    gallery_token: galleryToken,
    zapdata_contact_id: parsed.data.contactId ?? null,
    customer_name: parsed.data.contactName ?? null,
    phone: parsed.data.phone ?? null,
    source_image_url: sourceImageUrl,
    context_final: contextFinal,
    niche_id: nicheId,
    receipt_id: parsed.data.receiptId ?? null,
    included_photos: parsed.data.includedPhotos,
    paid_amount_cents: Math.round(parsed.data.paidAmount * 100),
    generation_count: parsed.data.generationCount,
    status: "queued",
  };
  let { error: projectError } = await supabase
    .from("projects")
    .insert(projectPayload);

  if (
    projectError?.code === "42703" ||
    projectError?.message.includes("generation_count")
  ) {
    const { generation_count: generationCount, ...legacyProjectPayload } =
      projectPayload;
    void generationCount;
    const fallbackInsert = await supabase
      .from("projects")
      .insert(legacyProjectPayload);
    projectError = fallbackInsert.error;
  }

  if (projectError) {
    return NextResponse.json(
      { ok: false, error: `Falha ao criar galeria: ${projectError.message}` },
      { status: 500 },
    );
  }

  const { error: photosError } = await supabase.from("photos").insert(
    generationPrompts.map(({ position, prompt }) => ({
      project_id: projectId,
      position,
      generation_prompt: prompt,
      status: "queued",
    })),
  );

  if (photosError) {
    await supabase.from("projects").delete().eq("id", projectId);
    return NextResponse.json(
      {
        ok: false,
        error: `Falha ao preparar as imagens: ${photosError.message}`,
      },
      { status: 500 },
    );
  }

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
