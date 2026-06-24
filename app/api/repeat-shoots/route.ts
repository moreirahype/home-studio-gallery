import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPixPayment } from "@/lib/mercado-pago";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyExpressOfferToken } from "@/lib/offers";
import {
  buildGenerationPrompts,
  refineGenerationContext,
} from "@/lib/prompt-builder";
import {
  DEFAULT_FIRST_EXTRA_AMOUNT_CENTS,
  getFirstExtraAmountCentsFromPricingBaseAmountCents,
  getPricingBaseAmountCentsFromFirstExtraAmountCents,
} from "@/lib/pricing";

const fieldsSchema = z.object({
  sourceToken: z.string().optional(),
  theme: z.string().min(2),
  occasion: z.string().max(240).optional(),
  styleNotes: z.string().max(1000).optional(),
  offer: z.enum(["standard", "express"]).default("standard"),
  offerToken: z.string().optional(),
  paidAmount: z.string().optional(),
  includedPhotos: z.string().optional(),
  generationCount: z.string().optional(),
  firstExtraAmount: z.string().optional(),
});

function customerEmail(projectId: string) {
  return `cliente+${projectId.replaceAll("-", "")}@home-studio-gallery.com.br`;
}

function parseAmountCents(value: string | undefined, fallbackCents: number) {
  const amount = Number(value?.replace(",", "."));
  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100)
    : fallbackCents;
}

function parseCount(value: string | undefined, fallback: number) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : fallback;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = fieldsSchema.safeParse({
    sourceToken: formData.get("sourceToken")?.toString(),
    theme: formData.get("theme")?.toString(),
    occasion: formData.get("occasion")?.toString(),
    styleNotes: formData.get("styleNotes")?.toString(),
    offer: formData.get("offer")?.toString(),
    offerToken: formData.get("offerToken")?.toString(),
    paidAmount: formData.get("paidAmount")?.toString(),
    includedPhotos: formData.get("includedPhotos")?.toString(),
    generationCount: formData.get("generationCount")?.toString(),
    firstExtraAmount: formData.get("firstExtraAmount")?.toString(),
  });
  const reference = formData.get("reference");

  if (!parsed.success || !(reference instanceof File) || !reference.size) {
    return NextResponse.json(
      { ok: false, error: "Preencha o tema e envie uma foto válida." },
      { status: 400 },
    );
  }

  if (reference.size > 15 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "A foto deve ter no máximo 15 MB." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const isExpress = parsed.data.offer === "express";
  if (
    isExpress &&
    !verifyExpressOfferToken(
      parsed.data.offerToken,
      parsed.data.sourceToken,
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Esta oferta especial expirou." },
      { status: 403 },
    );
  }
  let photoCount = isExpress
    ? 5
    : Math.min(20, parseCount(parsed.data.generationCount, 15));
  let includedPhotos = isExpress
    ? 1
    : Math.min(photoCount, parseCount(parsed.data.includedPhotos, 1));
  let paidAmountCents = isExpress
    ? 490
    : parseAmountCents(parsed.data.paidAmount, 790);
  let sourceProjectId: string | null = null;
  let customerName = "Cliente Home Studio";
  let customerPhone: string | null = null;
  let galleryAttendant = "Galeria App";
  let inheritedFirstExtraAmountCents = DEFAULT_FIRST_EXTRA_AMOUNT_CENTS;

  if (parsed.data.sourceToken) {
    const { data: sourceProject } = await supabase
      .from("projects")
      .select("*")
      .eq("gallery_token", parsed.data.sourceToken)
      .maybeSingle();
    sourceProjectId = sourceProject?.id ?? null;
    customerName = sourceProject?.customer_name || customerName;
    customerPhone = sourceProject?.phone ?? null;
    galleryAttendant =
      sourceProject?.bi_attendant_name ||
      `Galeria ${(Number(sourceProject?.paid_amount_cents ?? 0) / 100).toFixed(2)}`;
    if (sourceProject?.pricing_base_amount_cents) {
      inheritedFirstExtraAmountCents =
        getFirstExtraAmountCentsFromPricingBaseAmountCents({
          pricingBaseAmountCents: Number(sourceProject.pricing_base_amount_cents),
          includedPhotos: Number(sourceProject.included_photos ?? 1),
        });
    }

    if (sourceProject && !isExpress) {
      photoCount = 15;
      includedPhotos = 1;
      paidAmountCents = Number(sourceProject.paid_amount_cents ?? 790);
    }
  }

  const firstExtraAmountCents = isExpress
    ? null
    : sourceProjectId
      ? inheritedFirstExtraAmountCents
      : parseAmountCents(
          parsed.data.firstExtraAmount,
          inheritedFirstExtraAmountCents,
        );
  const pricingBaseAmountCents = firstExtraAmountCents
    ? getPricingBaseAmountCentsFromFirstExtraAmountCents({
        firstExtraAmountCents,
        includedPhotos,
      })
    : null;

  const requestId = randomUUID();
  const extension = reference.name.split(".").pop()?.toLowerCase() || "jpg";
  const referencePath = `repeat/${requestId}/reference.${extension}`;
  const upload = await supabase.storage
    .from("source-images")
    .upload(referencePath, Buffer.from(await reference.arrayBuffer()), {
      contentType: reference.type || "image/jpeg",
      upsert: false,
    });

  if (upload.error) {
    return NextResponse.json(
      { ok: false, error: `Falha ao enviar a foto: ${upload.error.message}` },
      { status: 500 },
    );
  }

  const signedReference = await supabase.storage
    .from("source-images")
    .createSignedUrl(referencePath, 60 * 60 * 48);

  if (signedReference.error || !signedReference.data?.signedUrl) {
    await supabase.storage.from("source-images").remove([referencePath]);
    return NextResponse.json(
        { ok: false, error: "Falha ao preparar a foto de referência." },
      { status: 500 },
    );
  }

  const projectId = randomUUID();
  const galleryToken = randomUUID().replaceAll("-", "");
  const contextFinal = [
    `Tema: ${parsed.data.theme}`,
    parsed.data.occasion && `Ocasiao: ${parsed.data.occasion}`,
    parsed.data.styleNotes && `Detalhes: ${parsed.data.styleNotes}`,
  ]
    .filter(Boolean)
    .join(". ");
  const refinedContextFinal = refineGenerationContext(contextFinal);
  const prompts = buildGenerationPrompts(refinedContextFinal).slice(0, photoCount);
  const projectPayload = {
    id: projectId,
    gallery_token: galleryToken,
    customer_name: customerName,
    phone: customerPhone,
    source_image_url: signedReference.data.signedUrl,
    source_image_path: referencePath,
    context_final: refinedContextFinal,
    niche_id: "repeat_shoot",
    included_photos: includedPhotos,
    paid_amount_cents: paidAmountCents,
    pricing_base_amount_cents: pricingBaseAmountCents,
    generation_count: photoCount,
    bi_attendant_name: galleryAttendant,
    status: "queued",
  };
  let { error: projectError } = await supabase
    .from("projects")
    .insert(projectPayload);

  if (projectError?.message.includes("pricing_base_amount_cents")) {
    const { pricing_base_amount_cents: ignoredPricing, ...legacyProjectPayload } =
      projectPayload;
    void ignoredPricing;
    const fallback = await supabase
      .from("projects")
      .insert(legacyProjectPayload);
    projectError = fallback.error;
  } else if (projectError?.message.includes("bi_attendant_name")) {
    const {
      bi_attendant_name: ignoredAttendant,
      ...legacyProjectPayload
    } =
      projectPayload;
    void ignoredAttendant;
    const fallback = await supabase
      .from("projects")
      .insert(legacyProjectPayload);
    projectError = fallback.error;
  }

  if (projectError) {
    await supabase.storage.from("source-images").remove([referencePath]);
    return NextResponse.json(
      { ok: false, error: `Falha ao criar ensaio: ${projectError.message}` },
      { status: 500 },
    );
  }

  const { error: photosError } = await supabase.from("photos").insert(
    prompts.map(({ position, prompt }) => ({
      project_id: projectId,
      position,
      generation_prompt: prompt,
      status: "queued",
    })),
  );

  if (photosError) {
    await supabase.from("projects").delete().eq("id", projectId);
    await supabase.storage.from("source-images").remove([referencePath]);
    return NextResponse.json(
      { ok: false, error: `Falha ao preparar fotos: ${photosError.message}` },
      { status: 500 },
    );
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      project_id: projectId,
      amount_cents: paidAmountCents,
      status: "pending",
    })
    .select("id")
    .single();

  if (orderError || !order) {
    await supabase.from("projects").delete().eq("id", projectId);
    await supabase.storage.from("source-images").remove([referencePath]);
    return NextResponse.json(
      { ok: false, error: "Falha ao criar pagamento do novo ensaio." },
      { status: 500 },
    );
  }

  const { error } = await supabase.from("repeat_shoots").insert({
    id: requestId,
    source_project_id: sourceProjectId,
    project_id: projectId,
    order_id: order.id,
    reference_image_path: referencePath,
    theme: parsed.data.theme,
    occasion: parsed.data.occasion || null,
    style_notes: parsed.data.styleNotes || null,
    photo_count: photoCount,
    included_photos: includedPhotos,
    paid_amount_cents: paidAmountCents,
    status: "pending_payment",
  });

  if (error) {
    await supabase.from("orders").delete().eq("id", order.id);
    await supabase.from("projects").delete().eq("id", projectId);
    await supabase.storage.from("source-images").remove([referencePath]);
    return NextResponse.json(
      { ok: false, error: `Falha ao preparar o ensaio: ${error.message}` },
      { status: 500 },
    );
  }

  const metaTracking = {
    fbp: request.cookies.get("_fbp")?.value,
    fbc: request.cookies.get("_fbc")?.value,
  };
  const { error: itemError } = await supabase.from("order_items").insert({
    order_id: order.id,
    kind: "new_shoot",
    description: "Novo ensaio",
    quantity: 1,
    amount_cents: paidAmountCents,
    metadata: { repeatShootId: requestId, ...metaTracking },
  });

  if (itemError) {
    await supabase.from("repeat_shoots").delete().eq("id", requestId);
    await supabase.from("orders").delete().eq("id", order.id);
    await supabase.from("projects").delete().eq("id", projectId);
    await supabase.storage.from("source-images").remove([referencePath]);
    return NextResponse.json(
      { ok: false, error: "Falha ao registrar o novo ensaio." },
      { status: 500 },
    );
  }

  try {
    const payment = await createPixPayment({
      orderId: order.id,
      amountCents: paidAmountCents,
      payerEmail: customerEmail(projectId),
      payerName: customerName,
      description: "Novo ensaio Home Studio",
      notificationUrl: new URL(
        "/api/webhooks/mercado-pago",
        process.env.APP_URL ?? request.nextUrl.origin,
      ).toString(),
    });
    const transactionData = payment.point_of_interaction?.transaction_data;
    if (!transactionData?.qr_code && !transactionData?.ticket_url) {
      throw new Error(
        "O Mercado Pago criou o pagamento, mas não devolveu o Pix Copia e Cola. Confira se a chave Pix está habilitada na conta produtiva.",
      );
    }

    await supabase
      .from("orders")
      .update({ mercado_pago_payment_id: String(payment.id) })
      .eq("id", order.id);

    return NextResponse.json({
      ok: true,
      repeatShootId: requestId,
      projectId,
      galleryToken,
      galleryUrl: new URL(
        `/g/${galleryToken}`,
        process.env.APP_URL ?? request.nextUrl.origin,
      ).toString(),
      orderId: order.id,
      paymentId: String(payment.id),
      amount: paidAmountCents / 100,
      photoCount,
      includedPhotos,
      qrCode: transactionData.qr_code,
      qrCodeBase64: transactionData.qr_code_base64,
      ticketUrl: transactionData.ticket_url,
      status: "pending_payment",
    });
  } catch (paymentError) {
    await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", order.id);
    return NextResponse.json(
      {
        ok: false,
        error:
          paymentError instanceof Error
            ? paymentError.message
            : "Falha ao gerar Pix.",
      },
      { status: 502 },
    );
  }
}
