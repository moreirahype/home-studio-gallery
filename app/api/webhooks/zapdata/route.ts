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
  DEFAULT_FIRST_EXTRA_AMOUNT_CENTS,
  formatReaisFromCents,
  getFirstExtraAmountCentsFromPricingBaseAmountCents,
  getPricingBaseAmountCentsFromFirstExtraAmountCents,
} from "@/lib/pricing";
import {
  normalizeGalleryType,
  parseExtraPhotoPricingCents,
  parseStoredExtraPhotoPricingCents,
  resolveOfferDefaults,
} from "@/lib/gallery-offer-config";
import {
  defaultGalleryAttendant,
  normalizeZapdataPayload,
  previewValue,
  zapdataOfferSchema,
} from "@/lib/zapdata-payload";

function mergeContexts(initialContext?: string, finalContext?: string) {
  const initial = initialContext?.trim();
  const final = finalContext?.trim();

  if (!initial) return final ?? "";
  if (!final) return initial;

  const normalizedInitial = initial.toLowerCase();
  const normalizedFinal = final.toLowerCase();

  if (normalizedFinal.includes(normalizedInitial)) return final;
  if (normalizedInitial.includes(normalizedFinal)) return initial;

  return `${initial}. ${final}`;
}

function galleryMessage(galleryUrl: string) {
  return `Seu ensaio ficou pronto. Acesse sua galeria aqui:\n\n${galleryUrl}\n\nNão precisa enviar comprovante no WhatsApp. As liberações acontecem automaticamente pela própria galeria.`;
}

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
        gallery_type?: string | null;
        extra_photo_pricing?: unknown;
        video_price_cents?: number | null;
        first_impression_pack_price_cents?: number | null;
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

    async function findLeadBy(
      field: "zapdata_contact_id" | "phone",
      value: string,
      pendingOnly: boolean,
    ) {
      let query = supabase
        .from("zapdata_leads")
        .select(leadFields)
        .eq(field, value)
        .order("created_at", { ascending: false })
        .limit(1);

      if (pendingOnly) {
        query = query.eq("status", "pending_payment").is("consumed_at", null);
      }

      return query.maybeSingle();
    }

    const lookupKeys = [
      parsed.data.contactId
        ? ({ field: "zapdata_contact_id", value: parsed.data.contactId } as const)
        : null,
      parsed.data.phone
        ? ({ field: "phone", value: parsed.data.phone } as const)
        : null,
    ].filter(
      (
        key,
      ): key is { field: "zapdata_contact_id" | "phone"; value: string } =>
        Boolean(key),
    );

    for (const pendingOnly of [true, false]) {
      for (const key of lookupKeys) {
        if (savedLead || leadError) break;
        const result = await findLeadBy(key.field, key.value, pendingOnly);
        savedLead = result.data;
        leadError = result.error;
      }
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
      .select(
        "gallery_token, included_photos, paid_amount_cents, generation_count, pricing_base_amount_cents",
      )
      .eq("id", savedLead.project_id)
      .maybeSingle();

    if (existingProject) {
      const reusedFirstExtraAmountCents = existingProject.pricing_base_amount_cents
        ? getFirstExtraAmountCentsFromPricingBaseAmountCents({
            pricingBaseAmountCents: Number(existingProject.pricing_base_amount_cents),
            includedPhotos: Number(existingProject.included_photos ?? 1),
          })
        : DEFAULT_FIRST_EXTRA_AMOUNT_CENTS;
      const reusedNewShootUrl = new URL("/novo", appUrl);
      reusedNewShootUrl.searchParams.set("source", existingProject.gallery_token);
      reusedNewShootUrl.searchParams.set(
        "paidAmount",
        formatReaisFromCents(Number(existingProject.paid_amount_cents ?? 790)),
      );
      reusedNewShootUrl.searchParams.set("includedPhotos", "1");
      reusedNewShootUrl.searchParams.set("generationCount", "15");
      reusedNewShootUrl.searchParams.set(
        "firstExtraAmount",
        formatReaisFromCents(reusedFirstExtraAmountCents),
      );

      const reusedGalleryUrl = new URL(
        `/g/${existingProject.gallery_token}`,
        appUrl,
      ).toString();

      return NextResponse.json({
        ok: true,
        projectId: savedLead.project_id,
        status: "queued",
        galleryUrl: reusedGalleryUrl,
        gallery_url: reusedGalleryUrl,
        galleryLink: reusedGalleryUrl,
        galleryMessage: galleryMessage(reusedGalleryUrl),
        newShootUrl: reusedNewShootUrl.toString(),
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
  const receivedInitialContext =
    parsed.data.initialContext?.trim() || parsed.data.contexto_inicial?.trim();
  const receivedFinalContext =
    parsed.data.contextFinal?.trim() || parsed.data.contexto_final?.trim();
  const receivedContext =
    savedLead?.context_final ||
    mergeContexts(receivedInitialContext, receivedFinalContext);
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
    contexto_inicial: previewValue(parsed.data.contexto_inicial),
    initialContext: previewValue(parsed.data.initialContext),
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

  const productName =
    savedLead?.product_name?.trim() ||
    parsed.data.produto?.trim() ||
    parsed.data.productName?.trim() ||
    parsed.data.nicho?.trim() ||
    parsed.data.nicheId?.trim() ||
    "Sem produto";
  const galleryType = normalizeGalleryType(
    savedLead?.gallery_type ?? parsed.data.galleryType ?? parsed.data.gallery_type,
  );
  const explicitExtraPricing = savedLead?.extra_photo_pricing
    ? parseStoredExtraPhotoPricingCents(savedLead.extra_photo_pricing)
    : parseExtraPhotoPricingCents(
        parsed.data.extraPhotoPricing ?? parsed.data.extra_photo_pricing,
      );
  const nicheId = savedLead?.niche_id ?? parsed.data.nicho ?? parsed.data.nicheId;
  const offerDefaults = resolveOfferDefaults({
    galleryType,
    paidAmountCents:
      savedLead?.paid_amount_cents ?? Math.round(parsed.data.paidAmount * 100),
    includedPhotos: savedLead?.included_photos ?? parsed.data.includedPhotos,
    generationCount: savedLead?.generation_count ?? parsed.data.generationCount,
    extraPhotoPricingCents: explicitExtraPricing,
    videoPriceCents:
      savedLead?.video_price_cents ??
      (parsed.data.videoPrice ?? parsed.data.video_price
        ? Math.round((parsed.data.videoPrice ?? parsed.data.video_price ?? 0) * 100)
        : null),
    firstImpressionPackPriceCents:
      savedLead?.first_impression_pack_price_cents ??
      (parsed.data.firstImpressionPackPrice ??
      parsed.data.first_impression_pack_price
        ? Math.round(
            (parsed.data.firstImpressionPackPrice ??
              parsed.data.first_impression_pack_price ??
              0) * 100,
          )
        : null),
  });
  const includedPhotos = offerDefaults.includedPhotos;
  const paidAmountCents = offerDefaults.paidAmountCents;
  const parsedFirstExtraAmountCents = parsed.data.firstExtraAmount
    ? Math.round(parsed.data.firstExtraAmount * 100)
    : null;
  const pricingBaseAmountCents =
    savedLead?.pricing_base_amount_cents ??
    (parsedFirstExtraAmountCents
      ? getPricingBaseAmountCentsFromFirstExtraAmountCents({
          firstExtraAmountCents: parsedFirstExtraAmountCents,
          includedPhotos,
        })
      : null);
  const firstExtraAmountCents =
    parsedFirstExtraAmountCents ??
    (pricingBaseAmountCents
      ? getFirstExtraAmountCentsFromPricingBaseAmountCents({
          pricingBaseAmountCents,
          includedPhotos,
        })
      : DEFAULT_FIRST_EXTRA_AMOUNT_CENTS);
  const generationCount = offerDefaults.generationCount;
  const galleryAttendant =
    savedLead?.bi_attendant_name?.trim() ||
    defaultGalleryAttendant({
      amount: (firstExtraAmountCents ?? paidAmountCents) / 100,
    });
  const generationPrompts = buildGenerationPrompts(contextFinal).slice(
    0,
    generationCount,
  );
  const galleryUrl = new URL(
    `/g/${galleryToken}`,
    appUrl,
  );
  const newShootUrl = new URL("/novo", appUrl);
  newShootUrl.searchParams.set("source", galleryToken);
  newShootUrl.searchParams.set("paidAmount", formatReaisFromCents(paidAmountCents));
  newShootUrl.searchParams.set("includedPhotos", String(includedPhotos));
  newShootUrl.searchParams.set("generationCount", String(generationCount));
  newShootUrl.searchParams.set(
    "firstExtraAmount",
    formatReaisFromCents(firstExtraAmountCents ?? DEFAULT_FIRST_EXTRA_AMOUNT_CENTS),
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
    gallery_type: galleryType,
    extra_photo_pricing: offerDefaults.extraPhotoPricingCents,
    video_price_cents: offerDefaults.videoPriceCents,
    first_impression_pack_price_cents:
      offerDefaults.firstImpressionPackPriceCents,
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
    projectError?.message.includes("gallery_type") ||
    projectError?.message.includes("extra_photo_pricing") ||
    projectError?.message.includes("video_price_cents") ||
    projectError?.message.includes("first_impression_pack_price_cents")
  ) {
    const {
      gallery_type: ignoredGalleryType,
      extra_photo_pricing: ignoredExtraPricing,
      video_price_cents: ignoredVideoPrice,
      first_impression_pack_price_cents: ignoredPackPrice,
      ...legacyOfferPayload
    } = compatibleProjectPayload;
    void ignoredGalleryType;
    void ignoredExtraPricing;
    void ignoredVideoPrice;
    void ignoredPackPrice;
    compatibleProjectPayload = legacyOfferPayload as typeof projectPayload;
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
    Boolean(contextFinal);

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
          gallery_url: galleryUrl.toString(),
          galleryLink: galleryUrl.toString(),
          galleryMessage: galleryMessage(galleryUrl.toString()),
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
    gallery_url: galleryUrl.toString(),
    galleryLink: galleryUrl.toString(),
    galleryMessage: galleryMessage(galleryUrl.toString()),
    newShootUrl: newShootUrl.toString(),
    testMode: isTestMode,
    includedPhotos,
    paidAmount: paidAmountCents / 100,
    firstExtraAmount:
      firstExtraAmountCents === null || firstExtraAmountCents === undefined
        ? null
        : firstExtraAmountCents / 100,
    galleryAttendant,
    productName,
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
