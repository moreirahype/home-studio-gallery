import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { unauthorized } from "@/lib/http";
import { safeCompare } from "@/lib/security";
import { validatePublicImageUrl } from "@/lib/source-image";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
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
  const firstExtraAmountCents = parsed.data.firstExtraAmount
    ? Math.round(parsed.data.firstExtraAmount * 100)
    : null;
  const pricingBaseAmountCents = firstExtraAmountCents
    ? getPricingBaseAmountCentsFromFirstExtraAmountCents({
        firstExtraAmountCents,
        includedPhotos: parsed.data.includedPhotos,
      })
    : null;
  const attendantAmountCents =
    firstExtraAmountCents ??
    (pricingBaseAmountCents
      ? getFirstExtraAmountCentsFromPricingBaseAmountCents({
          pricingBaseAmountCents,
          includedPhotos: parsed.data.includedPhotos,
        })
      : DEFAULT_FIRST_EXTRA_AMOUNT_CENTS);
  const galleryAttendant = defaultGalleryAttendant({
    amount: attendantAmountCents / 100,
  });
  const leadPayload = {
    token,
    zapdata_contact_id: parsed.data.contactId ?? null,
    customer_name: parsed.data.contactName ?? null,
    phone: parsed.data.phone ?? null,
    source_image_url: sourceImageUrl,
    context_final: contextFinal,
    niche_id: parsed.data.nicho ?? parsed.data.nicheId,
    included_photos: parsed.data.includedPhotos,
    paid_amount_cents: Math.round(parsed.data.paidAmount * 100),
    pricing_base_amount_cents: pricingBaseAmountCents,
    generation_count: parsed.data.generationCount,
    bi_attendant_name: galleryAttendant,
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
  } else if (error?.message.includes("bi_attendant_name")) {
    const {
      bi_attendant_name: ignoredAttendant,
      pricing_base_amount_cents: ignoredPricingBase,
      ...legacyLeadPayload
    } = leadPayload;
    void ignoredAttendant;
    void ignoredPricingBase;
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
    includedPhotos: parsed.data.includedPhotos,
    paidAmount: parsed.data.paidAmount,
    firstExtraAmount: parsed.data.firstExtraAmount ?? null,
    generationCount: parsed.data.generationCount,
    galleryAttendant,
  });
}
