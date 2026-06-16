import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { settleMercadoPagoPayment } from "@/lib/checkout-fulfillment";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const requestSchema = z.object({
  galleryToken: z.string().min(8),
  orderId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Consulta inválida." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, mercado_pago_payment_id, projects!inner(gallery_token)")
    .eq("id", parsed.data.orderId)
    .eq("projects.gallery_token", parsed.data.galleryToken)
    .maybeSingle();

  if (!order) {
    return NextResponse.json(
      { ok: false, error: "Pedido não encontrado." },
      { status: 404 },
    );
  }

  if (order.status !== "paid" && order.mercado_pago_payment_id) {
    await settleMercadoPagoPayment(order.mercado_pago_payment_id);
  }

  const { data: refreshed } = await supabase
    .from("orders")
    .select("status")
    .eq("id", parsed.data.orderId)
    .single();

  return NextResponse.json({
    ok: true,
    paid: refreshed?.status === "paid",
    status: refreshed?.status ?? order.status,
  });
}
