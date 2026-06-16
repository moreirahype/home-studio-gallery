import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPixPayment } from "@/lib/mercado-pago";
import { getAdditionalPhotoAmountCents } from "@/lib/pricing";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const requestSchema = z.object({
  galleryToken: z.string().min(8),
  photoIds: z.array(z.string().min(1)).min(1).max(20),
  videoAdded: z.boolean().default(false),
  videoPhotoIds: z.array(z.string().min(1)).min(0).max(3).default([]),
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
  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, gallery_token, customer_name, included_photos, paid_amount_cents",
    )
    .eq("gallery_token", parsed.data.galleryToken)
    .maybeSingle();

  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Galeria não encontrada." },
      { status: 404 },
    );
  }

  const selectedPhotoIds = [...new Set(parsed.data.photoIds)];
  const videoPhotoIds = [
    ...new Set(
      parsed.data.videoPhotoIds.length
        ? parsed.data.videoPhotoIds
        : selectedPhotoIds.slice(0, 3),
    ),
  ].slice(0, 3);
  const allReferencedPhotos = [...new Set([...selectedPhotoIds, ...videoPhotoIds])];

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

  const photoAmountCents = getAdditionalPhotoAmountCents({
    selectedCount: selectedPhotoIds.length,
    includedPhotos: project.included_photos,
    paidAmountCents: project.paid_amount_cents,
  });
  const videoAmountCents = parsed.data.videoAdded
    ? Math.round((Number(process.env.VIDEO_UPSELL_PRICE) || 14.9) * 100)
    : 0;
  const amountCents = photoAmountCents + videoAmountCents;

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
      metadata: { photoIds: selectedPhotoIds },
    });
  }
  if (videoAmountCents > 0) {
    items.push({
      order_id: order.id,
      kind: "video",
      description: "Vídeo das fotos",
      quantity: 1,
      amount_cents: videoAmountCents,
      metadata: { videoPhotoIds },
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

    await supabase
      .from("orders")
      .update({ mercado_pago_payment_id: String(payment.id) })
      .eq("id", order.id);

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      paymentId: String(payment.id),
      amount: amountCents / 100,
      qrCode: payment.point_of_interaction?.transaction_data?.qr_code,
      qrCodeBase64:
        payment.point_of_interaction?.transaction_data?.qr_code_base64,
      ticketUrl: payment.point_of_interaction?.transaction_data?.ticket_url,
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
