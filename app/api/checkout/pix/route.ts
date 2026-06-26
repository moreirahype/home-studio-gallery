import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isGalleryExpired } from "@/lib/gallery-expiration";
import { createPixPayment } from "@/lib/mercado-pago";
import {
  getAvailablePaidPhotoCreditCents,
  getClaimedPhotoAccess,
} from "@/lib/photo-access";
import {
  DEFAULT_FIRST_IMPRESSION_PACK_PRICE_CENTS,
  DEFAULT_VIDEO_PRICE_CENTS,
  getAdditionalPhotoAmountCents,
  getLinearAddonAmountCents,
} from "@/lib/pricing";
import { parseExtraPhotoPricingCents } from "@/lib/gallery-offer-config";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const requestSchema = z.object({
  galleryToken: z.string().min(8),
  photoIds: z.array(z.string().min(1)).min(1).max(20),
  firstImpressionPackAdded: z.boolean().default(false),
  firstImpressionPackPhotoIds: z.array(z.string().min(1)).min(0).max(20).default([]),
  videoAdded: z.boolean().default(false),
  videoPhotoIds: z.array(z.string().min(1)).min(0).max(20).default([]),
});

function customerEmail(projectId: string) {
  return `cliente+${projectId.replaceAll("-", "")}@home-studio-gallery.com.br`;
}

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Pedido inválido." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const metaTracking = {
    fbp: request.cookies.get("_fbp")?.value,
    fbc: request.cookies.get("_fbc")?.value,
  };
  let { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, gallery_token, customer_name, included_photos, paid_amount_cents, pricing_base_amount_cents, extra_photo_pricing, video_price_cents, first_impression_pack_price_cents, created_at, expires_at",
    )
    .eq("gallery_token", parsed.data.galleryToken)
    .maybeSingle();

  if (projectError && projectError.code === "42703") {
    const fallback = await supabase
      .from("projects")
      .select(
        "id, gallery_token, customer_name, included_photos, paid_amount_cents, created_at",
      )
      .eq("gallery_token", parsed.data.galleryToken)
      .maybeSingle();
    project = fallback.data
      ? {
          ...fallback.data,
          pricing_base_amount_cents: null,
          extra_photo_pricing: null,
          video_price_cents: null,
          first_impression_pack_price_cents: null,
          expires_at: null,
        }
      : null;
    projectError = fallback.error;
  }

  if (projectError) {
    return NextResponse.json(
      { ok: false, error: projectError.message },
      { status: 500 },
    );
  }

  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Galeria não encontrada." },
      { status: 404 },
    );
  }

  if (isGalleryExpired(project.created_at, project.expires_at)) {
    return NextResponse.json(
      { ok: false, error: "Esta galeria expirou." },
      { status: 410 },
    );
  }

  const selectedPhotoIds = [...new Set(parsed.data.photoIds)];
  const videoPhotoIds = parsed.data.videoAdded
    ? [
        ...new Set(
          parsed.data.videoPhotoIds.length
            ? parsed.data.videoPhotoIds
            : selectedPhotoIds.slice(0, 1),
        ),
      ]
    : [];
  const firstImpressionPackPhotoIds = parsed.data.firstImpressionPackAdded
    ? [
        ...new Set(
          parsed.data.firstImpressionPackPhotoIds.length
            ? parsed.data.firstImpressionPackPhotoIds
            : selectedPhotoIds,
        ),
      ]
    : [];
  const allReferencedPhotos = [
    ...new Set([
      ...selectedPhotoIds,
      ...videoPhotoIds,
      ...firstImpressionPackPhotoIds,
    ]),
  ];

  const { data: photos } = await supabase
    .from("photos")
    .select("id")
    .eq("project_id", project.id)
    .eq("status", "ready")
    .in("id", allReferencedPhotos);
  const readyPhotoIds = new Set((photos ?? []).map((photo) => photo.id));

  if (allReferencedPhotos.some((photoId) => !readyPhotoIds.has(photoId))) {
    return NextResponse.json(
      { ok: false, error: "Alguma foto escolhida ainda não está pronta." },
      { status: 409 },
    );
  }

  let claimedAccess: Awaited<ReturnType<typeof getClaimedPhotoAccess>>;
  try {
    claimedAccess = await getClaimedPhotoAccess({
      supabase,
      projectId: project.id,
      includedPhotos: project.included_photos,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Nao foi possivel carregar as fotos liberadas.",
      },
      { status: 500 },
    );
  }

  const unlockedPhotoIds = new Set(claimedAccess.accessiblePhotoIds);

  const { data: paidPhotos } = await supabase
    .from("order_photos")
    .select("photo_id, orders!inner(status, project_id)")
    .eq("orders.project_id", project.id)
    .eq("orders.status", "paid");

  for (const row of paidPhotos ?? []) {
    const photoId = row.photo_id as string;
    if (!claimedAccess.blockedPhotoIds.has(photoId)) {
      unlockedPhotoIds.add(photoId);
    }
  }

  const { data: paidPhotoItems } = await supabase
    .from("order_items")
    .select("amount_cents, metadata, orders!inner(status, project_id)")
    .eq("kind", "photos")
    .eq("orders.project_id", project.id)
    .eq("orders.status", "paid");
  const paidPhotoCreditCents = getAvailablePaidPhotoCreditCents({
    items: paidPhotoItems ?? [],
    initialCreditCents: project.paid_amount_cents,
    blockedPhotoIds: claimedAccess.blockedPhotoIds,
  });
  const unlockedPhotoCreditCents =
    project.paid_amount_cents +
    getAdditionalPhotoAmountCents({
      selectedCount: unlockedPhotoIds.size,
      includedPhotos: project.included_photos,
      paidAmountCents: project.paid_amount_cents,
      pricingBaseAmountCents: project.pricing_base_amount_cents,
      extraPhotoPricingCents: parseExtraPhotoPricingCents(
        project.extra_photo_pricing,
      ),
    });
  const photoCreditCents = Math.max(
    paidPhotoCreditCents,
    unlockedPhotoCreditCents,
  );
  const targetPhotoCount = new Set([
    ...unlockedPhotoIds,
    ...selectedPhotoIds,
  ]).size;
  const targetPhotoTotalCents =
    project.paid_amount_cents +
    getAdditionalPhotoAmountCents({
      selectedCount: targetPhotoCount,
      includedPhotos: project.included_photos,
      paidAmountCents: project.paid_amount_cents,
      pricingBaseAmountCents: project.pricing_base_amount_cents,
      extraPhotoPricingCents: parseExtraPhotoPricingCents(
        project.extra_photo_pricing,
      ),
    });
  const photoAmountCents = Math.max(
    0,
    targetPhotoTotalCents - photoCreditCents,
  );
  const packAmountCents = parsed.data.firstImpressionPackAdded
    ? getLinearAddonAmountCents({
        count: firstImpressionPackPhotoIds.length,
        unitAmountCents:
          project.first_impression_pack_price_cents ??
          DEFAULT_FIRST_IMPRESSION_PACK_PRICE_CENTS,
      })
    : 0;
  const videoAmountCents = parsed.data.videoAdded
    ? getLinearAddonAmountCents({
        count: videoPhotoIds.length,
        unitAmountCents: project.video_price_cents ?? DEFAULT_VIDEO_PRICE_CENTS,
      })
    : 0;
  const amountCents = photoAmountCents + packAmountCents + videoAmountCents;

  if (amountCents <= 0) {
    return NextResponse.json(
      { ok: false, error: "Este pedido não possui valor para pagamento." },
      { status: 400 },
    );
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      project_id: project.id,
      amount_cents: amountCents,
      status: "pending",
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível criar o pedido." },
      { status: 500 },
    );
  }

  const items = [];
  if (photoAmountCents > 0) {
    items.push({
      order_id: order.id,
      kind: "photos",
      description: "Fotos adicionais",
      quantity: selectedPhotoIds.length,
      amount_cents: photoAmountCents,
      metadata: { photoIds: selectedPhotoIds, ...metaTracking },
    });
  }
  if (videoAmountCents > 0) {
    items.push({
      order_id: order.id,
      kind: "video",
      description:
        videoPhotoIds.length === 1 ? "Vídeo da foto" : "Vídeos das fotos",
      quantity: videoPhotoIds.length,
      amount_cents: videoAmountCents,
      metadata: { videoPhotoIds, ...metaTracking },
    });
  }
  if (packAmountCents > 0) {
    items.push({
      order_id: order.id,
      kind: "first_impression_pack",
      description: "Pack Primeira Impressao",
      quantity: firstImpressionPackPhotoIds.length,
      amount_cents: packAmountCents,
      metadata: { firstImpressionPackPhotoIds, ...metaTracking },
    });
  }

  const { error: itemsError } = await supabase.from("order_items").insert(items);
  if (itemsError) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível salvar os itens do pedido." },
      { status: 500 },
    );
  }

  try {
    const payment = await createPixPayment({
      orderId: order.id,
      amountCents,
      payerEmail: customerEmail(project.id),
      payerName: project.customer_name || "Cliente Home Studio",
      description: "Home Studio Gallery",
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
      orderId: order.id,
      paymentId: String(payment.id),
      amount: amountCents / 100,
      qrCode: transactionData.qr_code,
      qrCodeBase64: transactionData.qr_code_base64,
      ticketUrl: transactionData.ticket_url,
    });
  } catch (error) {
    await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", order.id);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível gerar o Pix.",
      },
      { status: 502 },
    );
  }
}
