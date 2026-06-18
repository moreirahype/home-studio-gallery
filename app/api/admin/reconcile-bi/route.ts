import { NextRequest, NextResponse } from "next/server";
import { settleMercadoPagoPayment } from "@/lib/checkout-fulfillment";
import { safeCompare } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const TEMPORARY_RECONCILE_TOKEN =
  "reconcile_8f93c2a7d4414f2eb58366f4130a79cb";

export async function POST(request: NextRequest) {
  if (
    !safeCompare(
      request.headers.get("x-reconcile-token"),
      TEMPORARY_RECONCILE_TOKEN,
    )
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, mercado_pago_payment_id")
    .eq("status", "paid")
    .not("mercado_pago_payment_id", "is", null);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const results = [];
  for (const order of orders ?? []) {
    await supabase
      .from("orders")
      .update({ bi_reported_at: null })
      .eq("id", order.id);

    try {
      results.push(
        await settleMercadoPagoPayment(order.mercado_pago_payment_id),
      );
    } catch (settlementError) {
      results.push({
        paid: false,
        orderId: order.id,
        error:
          settlementError instanceof Error
            ? settlementError.message
            : "Falha desconhecida.",
      });
    }
  }

  return NextResponse.json({ ok: true, count: results.length, results });
}
