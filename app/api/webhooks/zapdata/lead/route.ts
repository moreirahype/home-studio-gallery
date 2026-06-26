import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { unauthorized } from "@/lib/http";
import { safeCompare } from "@/lib/security";
import { validatePublicImageUrl } from "@/lib/source-image";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizeGalleryType,
  parseExtraPhotoPricingCents,
  resolveOfferDefaults,
} from "@/lib/gallery-offer-config";
import {
  defaultGalleryAttendant,
  normalizeZapdataPayload,
  previewValue,
  zapdataOfferSchema,
} from "@/lib/zapdata-payload";
import {
  DEFAULT_FIRST_EXTRA_AMOUNT_CENTS,
  getFirstExtraAmountCentsFromPricingBaseAmountCents,
  getPricingBaseAmountCentsFromFirstExtraAmountCents,
} from "@/lib/pricing";

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
      { ok: false, error: "Payload invalido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const sourceImageUrl =
    parsed.data.foto_cliente?.trim() || parsed.data.sourceImageUrl?.trim();
  const initialContext =
    parsed.data.initialContext?.trim() || parsed.data.contexto_inicial?.trim();
  const finalContext =
    parsed.data.contextFinal?.trim() || parsed.data.contexto_final?.trim();
  const contextFinal = mergeContexts(initialContext, finalContext);
  const received = {
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
        error: "foto_cliente precisa conter uma URL publica valida.",
        received,
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
        received,
      },
      { status: 400 },
    );
  }

  if (!contextFinal || contextFinal.length < 3) {
    return NextResponse.json(
      {
        ok: false,
        error: "contexto_final precisa estar preenchido.",
        received,
      },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const token = randomUUID().replaceAll("-", "");
  const galleryType = normalizeGalleryType(
    parsed.data.galleryType ?? parsed.data.gallery_type,
  );
  const explicitExtraPricing = parseExtraPhotoPricingCents(
    parsed.data.extraPhotoPricing ?? parsed.data.extra_photo_pricing,
  );
  const offerDefaults = resolveOfferDefaults({
    galleryType,
    paidAmountCents:
      parsed.data.paidAmount === undefined
        ? null
        : Math.round(parsed.data.paidAmount * 100),
    includedPhotos:
      parsed.data.includedPhotos === undefined ? null : parsed.data.includedPhotos,
    generationCount:
      parsed.data.generationCount === undefined ? null : parsed.data.generationCount,
    extraPhotoPricingCents: explicitExtraPricing,
    videoPriceCents:
      parsed.data.videoPrice ?? parsed.data.video_price
        ? Math.round((parsed.data.videoPrice ?? parsed.data.video_price ?? 0) * 100)
        : null,
    firstImpressionPackPriceCents:
      parsed.data.firstImpressionPackPrice ??
      parsed.data.first_impression_pack_price
        ? Math.round(
            (parsed.data.firstImpressionPackPrice ??
              parsed.data.first_impression_pack_price ??
              0) * 100,
          )
        : null,
  });
  const firstExtraAmountCents = parsed.data.firstExtraAmount
    ? Math.round(parsed.data.firstExtraAmount * 100)
    : null;
  const pricingBaseAmountCents = firstExtraAmountCents
    ? getPricingBaseAmountCentsFromFirstExtraAmountCents({
        firstExtraAmountCents,
        includedPhotos: offerDefaults.includedPhotos,
      })
    : null;
  const attendantAmountCents =
    firstExtraAmountCents ??
    (pricingBaseAmountCents
      ? getFirstExtraAmountCentsFromPricingBaseAmountCents({
          pricingBaseAmountCents,
          includedPhotos: offerDefaults.includedPhotos,
        })
      : DEFAULT_FIRST_EXTRA_AMOUNT_CENTS);
  const galleryAttendant = defaultGalleryAttendant({
    amount: attendantAmountCents / 100,
  });
  const productName =
    parsed.data.produto?.trim() ||
    parsed.data.productName?.trim() ||
    parsed.data.nicho?.trim() ||
    parsed.data.nicheId?.trim() ||
    "Sem produto";
  const leadPayload = {
    token,
    zapdata_contact_id: parsed.data.contactId ?? null,
    customer_name: parsed.data.contactName ?? null,
    phone: parsed.data.phone ?? null,
    source_image_url: sourceImageUrl,
    context_final: contextFinal,
    niche_id: parsed.data.nicho ?? parsed.data.nicheId,
    included_photos: offerDefaults.includedPhotos,
    paid_amount_cents: offerDefaults.paidAmountCents,
    pricing_base_amount_cents: pricingBaseAmountCents,
    generation_count: offerDefaults.generationCount,
    bi_attendant_name: galleryAttendant,
    product_name: productName,
    gallery_type: galleryType,
    extra_photo_pricing: offerDefaults.extraPhotoPricingCents,
    video_price_cents: offerDefaults.videoPriceCents,
    first_impression_pack_price_cents:
      offerDefaults.firstImpressionPackPriceCents,
    status: "pending_payment",
  };
  let { data: lead, error } = await supabase
    .from("zapdata_leads")
    .insert(leadPayload)
    .select("id, token")
    .single();

  if (error?.message.includes("pricing_base_amount_cents")) {
    const { pricing_base_amount_cents: ignoredPricingBase, ...legacyLeadPayload } =
      leadPayload;
    void ignoredPricingBase;
    const fallback = await supabase
      .from("zapdata_leads")
      .insert(legacyLeadPayload)
      .select("id, token")
      .single();
    lead = fallback.data;
    error = fallback.error;
  }

  if (error?.message.includes("bi_attendant_name")) {
    const {
      bi_attendant_name: ignoredAttendant,
      pricing_base_amount_cents: ignoredPricingBase,
      product_name: ignoredProduct,
      ...legacyLeadPayload
    } = leadPayload;
    void ignoredAttendant;
    void ignoredPricingBase;
    void ignoredProduct;
    const fallback = await supabase
      .from("zapdata_leads")
      .insert(legacyLeadPayload)
      .select("id, token")
      .single();
    lead = fallback.data;
    error = fallback.error;
  }

  if (error?.message.includes("product_name")) {
    const {
      product_name: ignoredProduct,
      pricing_base_amount_cents: ignoredPricingBase,
      ...legacyLeadPayload
    } = leadPayload;
    void ignoredProduct;
    void ignoredPricingBase;
    const fallback = await supabase
      .from("zapdata_leads")
      .insert(legacyLeadPayload)
      .select("id, token")
      .single();
    lead = fallback.data;
    error = fallback.error;
  }

  if (
    error?.message.includes("gallery_type") ||
    error?.message.includes("extra_photo_pricing") ||
    error?.message.includes("video_price_cents") ||
    error?.message.includes("first_impression_pack_price_cents")
  ) {
    const {
      gallery_type: ignoredGalleryType,
      extra_photo_pricing: ignoredExtraPricing,
      video_price_cents: ignoredVideoPrice,
      first_impression_pack_price_cents: ignoredPackPrice,
      pricing_base_amount_cents: ignoredPricingBase,
      product_name: ignoredProduct,
      bi_attendant_name: ignoredAttendant,
      ...legacyLeadPayload
    } = leadPayload;
    void ignoredGalleryType;
    void ignoredExtraPricing;
    void ignoredVideoPrice;
    void ignoredPackPrice;
    void ignoredPricingBase;
    void ignoredProduct;
    void ignoredAttendant;
    const fallback = await supabase
      .from("zapdata_leads")
      .insert(legacyLeadPayload)
      .select("id, token")
      .single();
    lead = fallback.data;
    error = fallback.error;
  }

  if (error || !lead) {
    return NextResponse.json(
      {
        ok: false,
        error: `Falha ao salvar lead: ${error?.message ?? "lead vazio"}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    leadId: lead.id,
    leadToken: lead.token,
    status: "pending_payment",
    includedPhotos: offerDefaults.includedPhotos,
    paidAmount: offerDefaults.paidAmountCents / 100,
    firstExtraAmount: parsed.data.firstExtraAmount ?? null,
    generationCount: offerDefaults.generationCount,
    galleryType,
    videoPrice: offerDefaults.videoPriceCents / 100,
    firstImpressionPackPrice:
      offerDefaults.firstImpressionPackPriceCents / 100,
    galleryAttendant,
    productName,
  });
}
