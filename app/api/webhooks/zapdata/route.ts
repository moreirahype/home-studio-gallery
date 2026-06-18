import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { unauthorized } from "@/lib/http";
import { startProjectGeneration } from "@/lib/generation";
import { getKieImageModel } from "@/lib/kie";
import { buildGenerationPrompts } from "@/lib/prompt-builder";
import { safeCompare } from "@/lib/security";
import { validatePublicImageUrl } from "@/lib/source-image";
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
  testMode: z.coerce.boolean().optional().default(false),
});

type ZapdataPayload = z.infer<typeof payloadSchema>;

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function normalizePayload(payload: unknown): Partial<ZapdataPayload> {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const data = payload as Record<string, unknown>;
  const variables =
    data.variables && typeof data.variables === "object"
      ? (data.variables as Record<string, unknown>)
      : {};
  const flowVariables =
    data.flow_variables && typeof data.flow_variables === "object"
      ? (data.flow_variables as Record<string, unknown>)
      : {};
  const contact =
    data.contact && typeof data.contact === "object"
      ? (data.contact as Record<string, unknown>)
      : {};

  return {
    ...data,
    contactId:
      readText(data.contactId) ??
      readText(contact.id),
    contactName:
      readText(data.contactName) ??
      readText(contact.name) ??
      readText(flowVariables.contactName),
    phone:
      readText(data.phone) ??
      readText(data.telefone) ??
      readText(variables.telefone) ??
      readText(flowVariables.telefone) ??
      readText(contact.phone),
    sourceImageUrl:
      readText(data.sourceImageUrl) ??
      readText(data.foto_cliente) ??
      readText(variables.foto_cliente) ??
      readText(flowVariables.foto_cliente),
    foto_cliente:
      readText(data.foto_cliente) ??
      readText(variables.foto_cliente) ??
      readText(flowVariables.foto_cliente),
    contextFinal:
      readText(data.contextFinal) ??
      readText(data.contexto_final) ??
      readText(variables.contexto_final) ??
      readText(flowVariables.contexto_final),
    contexto_final:
      readText(data.contexto_final) ??
      readText(variables.contexto_final) ??
      readText(flowVariables.contexto_final),
    nicho:
      readText(data.nicho) ??
      readText(variables.nicho) ??
      readText(flowVariables.nicho),
  };
}

function previewValue(value?: string) {
  if (!value) return null;
  return value.length > 220 ? `${value.slice(0, 220)}...` : value;
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");

  if (!safeCompare(secret, process.env.ZAPDATA_WEBHOOK_SECRET)) {
    return unauthorized();
  }

  const rawPayload = await request.json();
  const parsed = payloadSchema.safeParse(normalizePayload(rawPayload));

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
    parsed.data.foto_cliente?.trim() || parsed.data.sourceImageUrl?.trim();
  const receivedContext =
    parsed.data.contextFinal?.trim() || parsed.data.contexto_final?.trim();
  const sourceImageUrl =
    receivedSourceImage ||
    (isTestMode && parsed.data.testMode
      ? "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=1200"
      : "");
  const contextFinal =
    receivedContext ||
    (isTestMode && parsed.data.testMode ? "Ensaio premium para homologação" : "");
  const receivedDebug = {
    foto_cliente: previewValue(parsed.data.foto_cliente),
    sourceImageUrl: previewValue(parsed.data.sourceImageUrl),
    contexto_final: previewValue(parsed.data.contexto_final),
    contextFinal: previewValue(parsed.data.contextFinal),
  };

  if (!sourceImageUrl || !URL.canParse(sourceImageUrl)) {
    return NextResponse.json(
      {
        ok: false,
        error: "foto_cliente precisa conter uma URL pública válida.",
        received: receivedDebug,
      },
      { status: 400 },
    );
  }

  const sourceImageValidation = await validatePublicImageUrl(sourceImageUrl);
  if (!sourceImageValidation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: sourceImageValidation.error,
        sourceImageUrl,
        received: receivedDebug,
      },
      { status: 400 },
    );
  }

  if (contextFinal.length < 3) {
    return NextResponse.json(
      {
        ok: false,
        error: "contexto_final precisa estar preenchido.",
        received: receivedDebug,
      },
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

  let generation:
    | { started: { photoId: string; position: number; taskId: string }[]; failed: number }
    | undefined;
  const canAutoGenerate =
    process.env.KIE_AUTO_GENERATE === "true" &&
    Boolean(receivedSourceImage) &&
    Boolean(receivedContext);

  if (canAutoGenerate) {
    try {
      generation = await startProjectGeneration({
        projectId,
        appUrl,
      });
    } catch (error) {
      await supabase
        .from("projects")
        .update({ status: "failed" })
        .eq("id", projectId);
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Falha ao iniciar as imagens.",
          projectId,
          galleryUrl: galleryUrl.toString(),
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    projectId,
    status: "queued",
    galleryUrl: galleryUrl.toString(),
    testMode: isTestMode,
    includedPhotos: parsed.data.includedPhotos,
    generationStarted: Boolean(generation?.started.length),
    generationTasks: generation?.started.length ?? 0,
    generationPlan: {
      count: generationPrompts.length,
      nicheId,
      sourceImageUrl,
      contextFinal,
      imageModel: getKieImageModel(),
    },
  });
}
