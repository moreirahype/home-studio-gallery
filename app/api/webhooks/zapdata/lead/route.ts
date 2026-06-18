import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { unauthorized } from "@/lib/http";
import { safeCompare } from "@/lib/security";
import { validatePublicImageUrl } from "@/lib/source-image";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
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
      { ok: false, error: "Payload invalido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const sourceImageUrl =
    parsed.data.foto_cliente?.trim() || parsed.data.sourceImageUrl?.trim();
  const contextFinal =
    parsed.data.contextFinal?.trim() || parsed.data.contexto_final?.trim();
  const received = {
    foto_cliente: previewValue(parsed.data.foto_cliente),
    sourceImageUrl: previewValue(parsed.data.sourceImageUrl),
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
  const { data: lead, error } = await supabase
    .from("zapdata_leads")
    .insert({
      token,
      zapdata_contact_id: parsed.data.contactId ?? null,
      customer_name: parsed.data.contactName ?? null,
      phone: parsed.data.phone ?? null,
      source_image_url: sourceImageUrl,
      context_final: contextFinal,
      niche_id: parsed.data.nicho ?? parsed.data.nicheId,
      included_photos: parsed.data.includedPhotos,
      paid_amount_cents: Math.round(parsed.data.paidAmount * 100),
      generation_count: parsed.data.generationCount,
      status: "pending_payment",
    })
    .select("id, token")
    .single();

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
    generationCount: parsed.data.generationCount,
  });
}
