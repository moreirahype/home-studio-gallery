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
  const dataIdFromQuery =
    request.nextUrl.searchParams.get("data.id") ??
    request.nextUrl.searchParams.get("id");
  const parsed = notificationSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Notificacao invalida." },
      { status: 400 },
    );
  }

  const paymentId = parsed.data.data?.id ?? dataIdFromQuery;
  const signatureOk = verifyMercadoPagoSignature({
    signature: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId: paymentId?.toString() ?? null,
  });

  if (!signatureOk) {
    return NextResponse.json(
      { ok: false, error: "Assinatura invalida." },
      { status: 401 },
    );
  }

  if (paymentId) {
    try {
      const settlement = await settleMercadoPagoPayment(paymentId);
      if (settlement.paid && settlement.biReported === false) {
        return NextResponse.json(
          { ok: false, error: settlement.biReportError ?? "Falha ao registrar no BI." },
          { status: 500 },
        );
      }
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Falha ao processar pagamento.",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
