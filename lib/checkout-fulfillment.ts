import { reportGallerySaleToBi } from "@/lib/home-studio-bi";
import { getPayment, type MercadoPagoPayment } from "@/lib/mercado-pago";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { startVideoJob } from "@/lib/video";

type OrderItem = {
  kind: "photos" | "video" | "new_shoot";
  amount_cents: number;
  metadata: {
    photoIds?: string[];
    videoPhotoIds?: string[];
  };
};

function isPaid(payment: MercadoPagoPayment) {
  return (
    payment.status === "approved" ||
    payment.status_detail === "accredited"
  );
}

export async function settleMercadoPagoPayment(paymentId: string | number) {
  const payment = await getPayment(paymentId);
  const orderId = payment.external_reference;
  if (!orderId) return { paid: false, reason: "missing_external_reference" };

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, project_id, status, bi_reported_at, projects(customer_name, phone)",
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

  if (!order.bi_reported_at) {
    const totalUpsellCents = orderItems.reduce(
      (sum, item) => sum + item.amount_cents,
      0,
    );
    const product = videoItem
      ? photoIds.length
        ? "Fotos adicionais"
        : "Vídeo"
      : "Fotos adicionais";
    const project = Array.isArray(order.projects)
      ? order.projects[0]
      : order.projects;

    if (totalUpsellCents > 0 && project?.customer_name && project?.phone) {
      await reportGallerySaleToBi({
        paymentId: String(payment.id),
        customerName: project.customer_name,
        phone: project.phone,
        paidAt: payment.date_approved ?? new Date().toISOString(),
        product,
        upsellAmount: totalUpsellCents / 100,
      }).catch(() => null);
      await supabase
        .from("orders")
        .update({ bi_reported_at: new Date().toISOString() })
        .eq("id", order.id);
    }
  }

  return { paid: true, orderId: order.id };
}
