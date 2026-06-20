import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { unauthorized } from "@/lib/http";
import { startProjectGeneration } from "@/lib/generation";
import { getKieImageModel } from "@/lib/kie";
import { buildGenerationPrompts } from "@/lib/prompt-builder";
import { safeCompare } from "@/lib/security";
import { validatePublicImageUrl } from "@/lib/source-image";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  defaultGalleryAttendant,
  normalizeZapdataPayload,
  previewValue,
  zapdataOfferSchema,
} from "@/lib/zapdata-payload";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");

  if (!safeCompare(secret, process.env.ZAPDATA_WEBHOOK_SECRET)) {
    return unauthorized();
  }

  const rawPayload = await request.json();
  const parsed = zapdataOfferSchema.safeParse(
    normalizeZapdataPayload(rawPayload),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const projectId = randomUUID();
  const galleryToken = randomUUID().replaceAll("-", "");
  const appUrl = process.env.APP_URL ?? request.nextUrl.origin;
  const supabase = getSupabaseAdmin();
  const leadToken = parsed.data.leadToken?.trim();
  let savedLead:
    | {
        id: string;
        token: string;
        project_id: string | null;
        zapdata_contact_id: string | null;
        customer_name: string | null;
        phone: string | null;
        source_image_url: string;
        context_final: string;
        niche_id: string;
        included_photos: number;
        paid_amount_cents: number;
        pricing_base_amount_cents?: number | null;
        generation_count: number;
        bi_attendant_name?: string | null;
        product_name?: string | null;
        consumed_at: string | null;
      }
    | null = null;

  if (leadToken) {
    const { data: lead, error: leadError } = await supabase
      .from("zapdata_leads")
      .select("*")
      .eq("token", leadToken)
      .maybeSingle();

    if (leadError) {
      return NextResponse.json(
        { ok: false, error: `Falha ao buscar lead: ${leadError.message}` },
        { status: 500 },
      );
    }

    if (!lead) {
      return NextResponse.json(
        { ok: false, error: "leadToken nao encontrado." },
        { status: 404 },
      );
    }

    savedLead = lead;
  } else {
    const leadFields = "*";
    let leadError: { message: string } | null = null;

    if (parsed.data.contactId) {
      const result = await supabase
        .from("zapdata_leads")
        .select(leadFields)
        .eq("zapdata_contact_id", parsed.data.contactId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      savedLead = result.data;
      leadError = result.error;
    }

    if (!savedLead && !leadError && parsed.data.phone) {
      const result = await supabase
        .from("zapdata_leads")
        .select(leadFields)
        .eq("phone", parsed.data.phone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      savedLead = result.data;
      leadError = result.error;
    }

    if (leadError) {
      return NextResponse.json(
        { ok: false, error: `Falha ao buscar lead: ${leadError.message}` },
        { status: 500 },
      );
    }
  }

  if (savedLead?.project_id) {
    const { data: existingProject } = await supabase
      .from("projects")
      .select("gallery_token, included_photos, generation_count")
      .eq("id", savedLead.project_id)
      .maybeSingle();

    if (existingProject) {
      return NextResponse.json({
        ok: true,
        projectId: savedLead.project_id,
        status: "queued",
        galleryUrl: new URL(
          `/g/${existingProject.gallery_token}`,
          appUrl,
        ).toString(),
        includedPhotos: existingProject.included_photos,
        generationStarted: false,
        generationTasks: 0,
        reused: true,
      });
    }
  }

  const isTestMode =
    process.env.TEST_MODE === "true" && parsed.data.testMode === true;
  const receivedSourceImage =
    savedLead?.source_image_url ||
    parsed.data.foto_cliente?.trim() ||
    parsed.data.sourceImageUrl?.trim();
  const receivedContext =
    savedLead?.context_final ||
    parsed.data.contextFinal?.trim() ||
    parsed.data.contexto_final?.trim();
  const sourceImageUrl =
    receivedSourceImage ||
    (isTestMode
      ? "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=1200"
      : "");
  const contextFinal =
    receivedContext ||
    (isTestMode ? "Ensaio premium para homologação" : "");
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

  const nicheId = savedLead?.niche_id ?? parsed.data.nicho ?? parsed.data.nicheId;
  const includedPhotos =
    savedLead?.included_photos ?? parsed.data.includedPhotos;
  const paidAmountCents =
    savedLead?.paid_amount_cents ?? Math.round(parsed.data.paidAmount * 100);
  const pricingBaseAmountCents =
    savedLead?.pricing_base_amount_cents ??
    (parsed.data.pricingBaseAmount
      ? Math.round(parsed.data.pricingBaseAmount * 100)
      : null);
  const generationCount =
    savedLead?.generation_count ?? parsed.data.generationCount;
  const parsedProductName =
    parsed.data.productName ?? parsed.data.produto ?? parsed.data.nicho;
  const savedProductName = savedLead?.product_name?.trim();
  const productName =
    parsedProductName ??
    (savedProductName && savedProductName.toLowerCase() !== "galeria"
      ? savedProductName
      : undefined) ??
    "Geral";
  const galleryAttendant = defaultGalleryAttendant({
    amount: (pricingBaseAmountCents ?? paidAmountCents) / 100,
    productName,
  });
  const generationPrompts = buildGenerationPrompts(contextFinal).slice(
    0,
    generationCount,
  );
  const galleryUrl = new URL(
    `/g/${galleryToken}`,
    appUrl,
  );

  if (isTestMode) {
    galleryUrl.searchParams.set("test", "1");
  }

  const projectPayload = {
    id: projectId,
    gallery_token: galleryToken,
    zapdata_contact_id:
      savedLead?.zapdata_contact_id ?? parsed.data.contactId ?? null,
    customer_name: savedLead?.customer_name ?? parsed.data.contactName ?? null,
    phone: savedLead?.phone ?? parsed.data.phone ?? null,
    source_image_url: sourceImageUrl,
    context_final: contextFinal,
    niche_id: nicheId,
    receipt_id: parsed.data.receiptId ?? null,
    included_photos: includedPhotos,
    paid_amount_cents: paidAmountCents,
    pricing_base_amount_cents: pricingBaseAmountCents,
    generation_count: generationCount,
    bi_attendant_name: galleryAttendant,
    product_name: productName,
    status: "queued",
  };
  let compatibleProjectPayload = projectPayload;
  let { error: projectError } = await supabase
    .from("projects")
    .insert(compatibleProjectPayload);

  if (projectError?.message.includes("pricing_base_amount_cents")) {
    const { pricing_base_amount_cents: ignored, ...legacyPricingPayload } =
      compatibleProjectPayload;
    void ignored;
    compatibleProjectPayload = legacyPricingPayload as typeof projectPayload;
    const fallbackInsert = await supabase
      .from("projects")
      .insert(compatibleProjectPayload);
    projectError = fallbackInsert.error;
  }

  if (projectError?.message.includes("bi_attendant_name")) {
    const { bi_attendant_name: ignored, ...legacyAttributionPayload } =
      compatibleProjectPayload;
    void ignored;
    compatibleProjectPayload = legacyAttributionPayload as typeof projectPayload;
    const fallbackInsert = await supabase
      .from("projects")
      .insert(compatibleProjectPayload);
    projectError = fallbackInsert.error;
  }

  if (projectError?.message.includes("product_name")) {
    const { product_name: ignored, ...legacyProductPayload } =
      compatibleProjectPayload;
    void ignored;
    compatibleProjectPayload = legacyProductPayload as typeof projectPayload;
    const fallbackInsert = await supabase
      .from("projects")
      .insert(compatibleProjectPayload);
    projectError = fallbackInsert.error;
  }

  if (
    projectError?.code === "42703" ||
    projectError?.message.includes("generation_count")
  ) {
    const { generation_count: generationCount, ...legacyProjectPayload } =
      compatibleProjectPayload;
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

  if (savedLead) {
    await supabase
      .from("zapdata_leads")
      .update({
        project_id: projectId,
        status: "converted",
        consumed_at: new Date().toISOString(),
      })
      .eq("id", savedLead.id);
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
    includedPhotos,
    paidAmount: paidAmountCents / 100,
    pricingBaseAmount:
      pricingBaseAmountCents === null || pricingBaseAmountCents === undefined
        ? null
        : pricingBaseAmountCents / 100,
    productName,
    galleryAttendant,
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
