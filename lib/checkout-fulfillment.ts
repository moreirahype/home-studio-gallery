import { reportGallerySaleToBi } from "@/lib/home-studio-bi";
import { startProjectGeneration } from "@/lib/generation";
import { getPayment, type MercadoPagoPayment } from "@/lib/mercado-pago";
import { reportMetaPurchase } from "@/lib/meta-conversions";
import {
  DEFAULT_FIRST_EXTRA_AMOUNT_CENTS,
  getFirstExtraAmountCentsFromPricingBaseAmountCents,
} from "@/lib/pricing";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { startVideoJob } from "@/lib/video";
import { defaultGalleryAttendant } from "@/lib/zapdata-payload";

type OrderItem = {
  kind: "photos" | "video" | "new_shoot";
  amount_cents: number;
  metadata: {
    photoIds?: string[];
    videoPhotoIds?: string[];
    repeatShootId?: string;
  };
};

function isPaid(payment: MercadoPagoPayment) {
  return (
    payment.status === "approved" ||
    payment.status_detail === "accredited"
  );
}

function getNetReceivedAmount(payment: MercadoPagoPayment, grossAmount: number) {
  const netReceived = payment.transaction_details?.net_received_amount;
  if (typeof netReceived === "number" && Number.isFinite(netReceived)) {
    return Math.max(0, netReceived);
  }

  const feeAmount = (payment.fee_details ?? []).reduce((sum, fee) => {
    const amount = fee.amount;
    return typeof amount === "number" && Number.isFinite(amount)
      ? sum + amount
      : sum;
  }, 0);

  return Math.max(0, grossAmount - feeAmount);
}

export async function settleMercadoPagoPayment(paymentId: string | number) {
  const payment = await getPayment(paymentId);
  const orderId = payment.external_reference;
  if (!orderId) return { paid: false, reason: "missing_external_reference" };

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, project_id, status, bi_reported_at, projects(customer_name, phone, paid_amount_cents, gallery_token)",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { paid: false, reason: "order_not_found" };

  await supabase
    .from("orders")
    .update({ mercado_pago_payment_id: String(payment.id) })
    .eq("id", order.id);

  if (!isPaid(payment)) {
    return { paid: false, status: payment.status };
  }

  if (order.status !== "paid") {
    await supabase
      .from("orders")
      .update({
        status: "paid",
        paid_at: payment.date_approved ?? new Date().toISOString(),
      })
      .eq("id", order.id);
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("kind, amount_cents, metadata")
    .eq("order_id", order.id);
  const orderItems = (items ?? []) as OrderItem[];
  const project = Array.isArray(order.projects)
    ? order.projects[0]
    : order.projects;
  const photoIds = orderItems.flatMap((item) =>
    item.kind === "photos" ? (item.metadata.photoIds ?? []) : [],
  );

  if (photoIds.length) {
    await supabase.from("order_photos").upsert(
      [...new Set(photoIds)].map((photoId) => ({
        order_id: order.id,
        photo_id: photoId,
      })),
      { onConflict: "order_id,photo_id" },
    );
  }

  const videoItem = orderItems.find((item) => item.kind === "video");
  const videoPhotoIds = videoItem?.metadata.videoPhotoIds ?? [];
  if (videoPhotoIds.length) {
    const { data: existingVideo } = await supabase
      .from("video_jobs")
      .select("id")
      .eq("order_id", order.id)
      .maybeSingle();

    if (!existingVideo) {
      await startVideoJob({
        projectId: order.project_id,
        orderId: order.id,
        photoIds: videoPhotoIds,
        appUrl: process.env.APP_URL ?? "https://home-studio-gallery.vercel.app",
      });
    }
  }

  const newShootItem = orderItems.find((item) => item.kind === "new_shoot");
  const repeatShootId = newShootItem?.metadata.repeatShootId;
  if (repeatShootId) {
    const { data: repeatShoot } = await supabase
      .from("repeat_shoots")
      .select("status")
      .eq("id", repeatShootId)
      .maybeSingle();

    if (repeatShoot?.status === "pending_payment") {
      await supabase
        .from("repeat_shoots")
        .update({ status: "generating" })
        .eq("id", repeatShootId);

      try {
        await startProjectGeneration({
          projectId: order.project_id,
          appUrl:
            process.env.APP_URL ?? "https://home-studio-gallery.vercel.app",
        });
      } catch {
        await supabase
          .from("repeat_shoots")
          .update({ status: "failed" })
          .eq("id", repeatShootId);
        await supabase
          .from("projects")
          .update({ status: "failed" })
          .eq("id", order.project_id);
      }
    }
  }

  let biReported = Boolean(order.bi_reported_at);
  let biReportError: string | undefined;
  let metaReported = false;
  let metaReportError: string | undefined;
  const totalUpsellCents = orderItems.reduce(
    (sum, item) => sum + item.amount_cents,
    0,
  );

  if (totalUpsellCents > 0) {
    try {
      await reportMetaPurchase({
        eventId: `mp-${payment.id}-${order.id}`,
        value: totalUpsellCents / 100,
        customerName: project?.customer_name ?? "Cliente",
        phone: project?.phone ?? "",
        email: payment.payer?.email,
        eventSourceUrl: project?.gallery_token
          ? `${process.env.APP_URL ?? "https://home-studio-gallery.vercel.app"}/g/${project.gallery_token}`
          : undefined,
        contentIds: orderItems.map((item) => `gallery-${item.kind}`),
      });
      metaReported = true;
    } catch (error) {
      metaReportError =
        error instanceof Error ? error.message : "Falha desconhecida na Meta.";
    }
  }

  if (!biReported) {
    let { data: attribution, error: attributionError } = await supabase
      .from("projects")
      .select(
        "included_photos, pricing_base_amount_cents, bi_attendant_name",
      )
      .eq("id", order.project_id)
      .maybeSingle();

    if (attributionError?.message.includes("bi_attendant_name")) {
      const fallback = await supabase
        .from("projects")
        .select("included_photos, pricing_base_amount_cents")
        .eq("id", order.project_id)
        .maybeSingle();
      attribution = fallback.data
        ? { ...fallback.data, bi_attendant_name: null }
        : null;
      attributionError = fallback.error;
    }

    const firstExtraAmountCents = attribution?.pricing_base_amount_cents
      ? getFirstExtraAmountCentsFromPricingBaseAmountCents({
          pricingBaseAmountCents: Number(attribution.pricing_base_amount_cents),
          includedPhotos: Number(attribution.included_photos ?? 1),
        })
      : DEFAULT_FIRST_EXTRA_AMOUNT_CENTS;
    const attendantName =
      attribution?.bi_attendant_name?.trim() ||
      defaultGalleryAttendant({
        amount: firstExtraAmountCents / 100,
      });

    if (totalUpsellCents > 0) {
      const grossUpsellAmount = totalUpsellCents / 100;
      const netUpsellAmount = getNetReceivedAmount(payment, grossUpsellAmount);

      try {
        await reportGallerySaleToBi({
          paymentId: String(payment.id),
          customerName: project?.customer_name ?? "Cliente",
          phone: project?.phone ?? "",
          paidAt: payment.date_approved ?? new Date().toISOString(),
          upsellAmount: netUpsellAmount,
          attendantName,
        });
        await supabase
          .from("orders")
          .update({ bi_reported_at: new Date().toISOString() })
          .eq("id", order.id);
        biReported = true;
      } catch (error) {
        biReportError =
          error instanceof Error ? error.message : "Falha desconhecida no BI.";
      }
    }
  }

  return {
    paid: true,
    orderId: order.id,
    biReported,
    biReportError,
    metaReported,
    metaReportError,
  };
}
