import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { settleMercadoPagoPayment } from "@/lib/checkout-fulfillment";
import { verifyMercadoPagoSignature } from "@/lib/mercado-pago";

const notificationSchema = z
  .object({
    action: z.string().optional(),
    type: z.string().optional(),
    data: z.object({ id: z.union([z.string(), z.number()]) }).optional(),
  })
  .passthrough();

export async function POST(request: NextRequest) {
  const dataIdFromQuery = request.nextUrl.searchParams.get("data.id");
  const signatureOk = verifyMercadoPagoSignature({
    signature: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId: dataIdFromQuery,
  });

  if (!signatureOk) {
    return NextResponse.json(
      { ok: false, error: "Assinatura inválida." },
      { status: 401 },
    );
  }

  const parsed = notificationSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Notificação inválida." }, { status: 400 });
  }

  const paymentId = parsed.data.data?.id ?? dataIdFromQuery;
  if (paymentId) {
    await settleMercadoPagoPayment(paymentId).catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
