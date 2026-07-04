import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPixPayment } from "@/lib/mercado-pago";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { readFlashOfferToken, verifyExpressOfferToken } from "@/lib/offers";
import {
  normalizeGalleryType,
  parseStoredExtraPhotoPricingCents,
} from "@/lib/gallery-offer-config";
import {
  buildGenerationPrompts,
  refineGenerationContext,
} from "@/lib/prompt-builder";
import {
  DEFAULT_FIRST_EXTRA_AMOUNT_CENTS,
  DEFAULT_FIRST_IMPRESSION_PACK_PRICE_CENTS,
  DEFAULT_VIDEO_PRICE_CENTS,
  getFirstExtraAmountCentsFromPricingBaseAmountCents,
  getPricingBaseAmountCentsFromFirstExtraAmountCents,
} from "@/lib/pricing";

const fieldsSchema = z.object({
  sourceToken: z.string().optional(),
  theme: z.string().min(2),
  occasion: z.string().max(240).optional(),
  styleNotes: z.string().max(1000).optional(),
  offer: z.enum(["standard", "express", "flash", "upsell"]).default("standard"),
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
  const isUpsell = parsed.success && parsed.data.offer === "upsell";

  if (
    !parsed.success ||
    (!isUpsell && (!(reference instanceof File) || !reference.size))
  ) {
    return NextResponse.json(
      { ok: false, error: "Preencha o tema e envie uma foto válida." },
      { status: 400 },
    );
  }

  if (reference instanceof File && reference.size > 15 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "A foto deve ter no máximo 15 MB." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const isExpress = parsed.data.offer === "express";
  const isFlash = parsed.data.offer === "flash";
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
  const flashOffer = isFlash
    ? readFlashOfferToken(parsed.data.offerToken, parsed.data.sourceToken)
    : null;
  if (isFlash && !flashOffer) {
    return NextResponse.json(
      { ok: false, error: "Esta promoção relâmpago expirou." },
      { status: 403 },
    );
  }
  let photoCount = isExpress ? 5 : 15;
  let includedPhotos = 1;
  let paidAmountCents = isExpress ? 490 : 790;
  let sourceProjectId: string | null = null;
  let customerName = "Cliente Home Studio";
  let customerPhone: string | null = null;
  let galleryAttendant = "Galeria";
  let productName = "Sem produto";
  let galleryType: "universal" | "professional" = "universal";
  let extraPhotoPricingCents: Record<number, number> | null = null;
  let videoPriceCents = DEFAULT_VIDEO_PRICE_CENTS;
  let firstImpressionPackPriceCents =
    DEFAULT_FIRST_IMPRESSION_PACK_PRICE_CENTS;
  let inheritedFirstExtraAmountCents = DEFAULT_FIRST_EXTRA_AMOUNT_CENTS;
  let sourceProject: Record<string, unknown> | null = null;

  if (parsed.data.sourceToken) {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("gallery_token", parsed.data.sourceToken)
      .maybeSingle();
    sourceProject = data;
    sourceProjectId =
      typeof sourceProject?.id === "string" ? sourceProject.id : null;
    customerName = String(sourceProject?.customer_name || customerName);
    customerPhone =
      typeof sourceProject?.phone === "string" ? sourceProject.phone : null;
    galleryAttendant =
      isUpsell
        ? "Upsell"
        : isFlash
        ? "Remarketing"
        : String(
            sourceProject?.bi_attendant_name ||
              `Galeria ${(Number(sourceProject?.paid_amount_cents ?? 0) / 100).toFixed(2)}`,
          );
    productName = String(sourceProject?.product_name || productName);
    galleryType = normalizeGalleryType(
      typeof sourceProject?.gallery_type === "string"
        ? sourceProject.gallery_type
        : null,
    );
    extraPhotoPricingCents = parseStoredExtraPhotoPricingCents(
      sourceProject?.extra_photo_pricing,
    );
    videoPriceCents = Number(
      sourceProject?.video_price_cents ?? DEFAULT_VIDEO_PRICE_CENTS,
    );
    firstImpressionPackPriceCents = Number(
      sourceProject?.first_impression_pack_price_cents ??
        DEFAULT_FIRST_IMPRESSION_PACK_PRICE_CENTS,
    );
    if (sourceProject?.pricing_base_amount_cents) {
      inheritedFirstExtraAmountCents =
        getFirstExtraAmountCentsFromPricingBaseAmountCents({
          pricingBaseAmountCents: Number(sourceProject.pricing_base_amount_cents),
          includedPhotos: Number(sourceProject.included_photos ?? 1),
        });
    }

    if (sourceProject && !isExpress) {
      photoCount = Math.min(
        20,
        Math.max(1, Number(sourceProject.generation_count ?? 15)),
      );
      includedPhotos = Math.min(
        photoCount,
        Math.max(0, Number(sourceProject.included_photos ?? 1)),
      );
      paidAmountCents = flashOffer
        ? flashOffer.paidAmountCents
        : isUpsell
          ? parseAmountCents(parsed.data.paidAmount, 1490)
        : Number(sourceProject.paid_amount_cents ?? 790);
    }
  }

  if (isUpsell && !sourceProject) {
    return NextResponse.json(
      { ok: false, error: "Galeria original não encontrada." },
      { status: 404 },
    );
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
  let referencePath = "";
  let sourceImageUrl = "";
  let uploadedNewReference = false;

  if (isUpsell) {
    referencePath =
      typeof sourceProject?.source_image_path === "string"
        ? sourceProject.source_image_path
        : "";
    sourceImageUrl =
      typeof sourceProject?.source_image_url === "string"
        ? sourceProject.source_image_url
        : "";

    if (referencePath) {
      const signedReference = await supabase.storage
        .from("source-images")
        .createSignedUrl(referencePath, 60 * 60 * 48);

      if (signedReference.data?.signedUrl) {
        sourceImageUrl = signedReference.data.signedUrl;
      }
    }

    if (!sourceImageUrl) {
      return NextResponse.json(
        { ok: false, error: "Não foi possível reaproveitar a foto original." },
        { status: 500 },
      );
    }
  } else if (reference instanceof File) {
    const extension = reference.name.split(".").pop()?.toLowerCase() || "jpg";
    referencePath = `repeat/${requestId}/reference.${extension}`;
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
    uploadedNewReference = true;

    const signedReference = await supabase.storage
      .from("source-images")
      .createSignedUrl(referencePath, 60 * 60 * 48);

    if (signedReference.error || !signedReference.data?.signedUrl) {
      if (uploadedNewReference) {
        await supabase.storage.from("source-images").remove([referencePath]);
      }
      return NextResponse.json(
        { ok: false, error: "Falha ao preparar a foto de referência." },
        { status: 500 },
      );
    }
    sourceImageUrl = signedReference.data.signedUrl;
  }
  const projectId = randomUUID();
  const galleryToken = randomUUID().replaceAll("-", "");
  const contextFinal =
    isUpsell &&
    parsed.data.theme === "Mesmo estilo do ensaio atual" &&
    typeof sourceProject?.context_final === "string"
      ? sourceProject.context_final
      : [
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
    source_image_url: sourceImageUrl,
    source_image_path: referencePath,
    context_final: refinedContextFinal,
    niche_id: "repeat_shoot",
    included_photos: includedPhotos,
    paid_amount_cents: paidAmountCents,
    pricing_base_amount_cents: pricingBaseAmountCents,
    generation_count: photoCount,
    bi_attendant_name: galleryAttendant,
    product_name: productName,
    gallery_type: galleryType,
    extra_photo_pricing: extraPhotoPricingCents,
    video_price_cents: videoPriceCents,
    first_impression_pack_price_cents: firstImpressionPackPriceCents,
    status: "queued",
  };
  let compatibleProjectPayload = projectPayload;
  let { error: projectError } = await supabase
    .from("projects")
    .insert(compatibleProjectPayload);

  if (projectError?.message.includes("pricing_base_amount_cents")) {
    const { pricing_base_amount_cents: ignoredPricing, ...legacyProjectPayload } =
      compatibleProjectPayload;
    void ignoredPricing;
    compatibleProjectPayload = legacyProjectPayload as typeof projectPayload;
    const fallback = await supabase
      .from("projects")
      .insert(compatibleProjectPayload);
    projectError = fallback.error;
  }

  if (projectError?.message.includes("bi_attendant_name")) {
    const {
      bi_attendant_name: ignoredAttendant,
      ...legacyProjectPayload
    } =
      compatibleProjectPayload;
    void ignoredAttendant;
    compatibleProjectPayload = legacyProjectPayload as typeof projectPayload;
    const fallback = await supabase
      .from("projects")
      .insert(compatibleProjectPayload);
    projectError = fallback.error;
  }

  if (projectError?.message.includes("product_name")) {
    const { product_name: ignoredProduct, ...legacyProjectPayload } =
      compatibleProjectPayload;
    void ignoredProduct;
    compatibleProjectPayload = legacyProjectPayload as typeof projectPayload;
    const fallback = await supabase
      .from("projects")
      .insert(compatibleProjectPayload);
    projectError = fallback.error;
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
      ...legacyProjectPayload
    } = compatibleProjectPayload;
    void ignoredGalleryType;
    void ignoredExtraPricing;
    void ignoredVideoPrice;
    void ignoredPackPrice;
    compatibleProjectPayload = legacyProjectPayload as typeof projectPayload;
    const fallback = await supabase
      .from("projects")
      .insert(compatibleProjectPayload);
    projectError = fallback.error;
  }

  if (projectError) {
    if (uploadedNewReference) {
      await supabase.storage.from("source-images").remove([referencePath]);
    }
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
    if (uploadedNewReference) {
      await supabase.storage.from("source-images").remove([referencePath]);
    }
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
    if (uploadedNewReference) {
      await supabase.storage.from("source-images").remove([referencePath]);
    }
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
    if (uploadedNewReference) {
      await supabase.storage.from("source-images").remove([referencePath]);
    }
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
    if (uploadedNewReference) {
      await supabase.storage.from("source-images").remove([referencePath]);
    }
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
