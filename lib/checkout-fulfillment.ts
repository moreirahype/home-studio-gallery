import { reportGallerySaleToBi } from "@/lib/home-studio-bi";
import { startProjectGeneration } from "@/lib/generation";
import { getPayment, type MercadoPagoPayment } from "@/lib/mercado-pago";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { startVideoJob } from "@/lib/video";

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

export async function settleMercadoPagoPayment(paymentId: string | number) {
  const payment = await getPayment(paymentId);
  const orderId = payment.external_reference;
  if (!orderId) return { paid: false, reason: "missing_external_reference" };

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, project_id, status, bi_reported_at, projects(customer_name, phone, paid_amount_cents)",
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

  if (!biReported) {
    const totalUpsellCents = orderItems.reduce(
      (sum, item) => sum + item.amount_cents,
      0,
    );
    const project = Array.isArray(order.projects)
      ? order.projects[0]
      : order.projects;
    const { data: attribution } = await supabase
      .from("projects")
      .select("bi_attendant_name, product_name")
      .eq("id", order.project_id)
      .maybeSingle();
    const attendantName =
      attribution?.bi_attendant_name?.trim() ||
      `Galeria ${(Number(project?.paid_amount_cents ?? 0) / 100).toFixed(2)}`;
    const productName = attribution?.product_name?.trim() || "Galeria";

    if (totalUpsellCents > 0) {
      try {
        await reportGallerySaleToBi({
          paymentId: String(payment.id),
          customerName: project?.customer_name ?? "Cliente",
          phone: project?.phone ?? "",
          paidAt: payment.date_approved ?? new Date().toISOString(),
          upsellAmount: totalUpsellCents / 100,
          attendantName,
          productName,
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
  };
}
