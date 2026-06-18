import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPixPayment } from "@/lib/mercado-pago";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyExpressOfferToken } from "@/lib/offers";
import { buildGenerationPrompts } from "@/lib/prompt-builder";

const fieldsSchema = z.object({
  sourceToken: z.string().optional(),
  theme: z.string().min(2),
  occasion: z.string().max(240).optional(),
  styleNotes: z.string().max(1000).optional(),
  offer: z.enum(["standard", "express", "vip"]).default("standard"),
  offerToken: z.string().optional(),
});

function customerEmail(projectId: string) {
  return `cliente+${projectId.replaceAll("-", "")}@home-studio-gallery.com.br`;
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
  const isVip = parsed.data.offer === "vip";
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
  const photoCount = isVip ? 15 : isExpress ? 5 : 15;
  const includedPhotos = isVip ? 3 : 1;
  const paidAmountCents = isVip ? 1490 : isExpress ? 490 : 790;
  let sourceProjectId: string | null = null;
  let customerName = "Cliente Home Studio";
  let customerPhone: string | null = null;

  if (parsed.data.sourceToken) {
    const { data: sourceProject } = await supabase
      .from("projects")
      .select("id, customer_name, phone")
      .eq("gallery_token", parsed.data.sourceToken)
      .maybeSingle();
    sourceProjectId = sourceProject?.id ?? null;
    customerName = sourceProject?.customer_name || customerName;
    customerPhone = sourceProject?.phone ?? null;
  }

  if (isVip && !sourceProjectId) {
    return NextResponse.json(
      { ok: false, error: "Esta oferta precisa partir de uma galeria valida." },
      { status: 403 },
    );
  }

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
      { ok: false, error: "Falha ao preparar a foto de referencia." },
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
  const prompts = buildGenerationPrompts(contextFinal).slice(0, photoCount);
  const { error: projectError } = await supabase.from("projects").insert({
    id: projectId,
    gallery_token: galleryToken,
    customer_name: customerName,
    phone: customerPhone,
    source_image_url: signedReference.data.signedUrl,
    source_image_path: referencePath,
    context_final: contextFinal,
    niche_id: "repeat_shoot",
    included_photos: includedPhotos,
    paid_amount_cents: paidAmountCents,
    generation_count: photoCount,
    status: "queued",
  });

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

  const { error: itemError } = await supabase.from("order_items").insert({
    order_id: order.id,
    kind: "new_shoot",
    description: "Novo ensaio",
    quantity: 1,
    amount_cents: paidAmountCents,
    metadata: { repeatShootId: requestId },
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
      qrCode: payment.point_of_interaction?.transaction_data?.qr_code,
      qrCodeBase64:
        payment.point_of_interaction?.transaction_data?.qr_code_base64,
      ticketUrl: payment.point_of_interaction?.transaction_data?.ticket_url,
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
