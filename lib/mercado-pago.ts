import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

type PixPaymentRequest = {
  orderId: string;
  amountCents: number;
  description: string;
  payerEmail: string;
  payerName: string;
  notificationUrl: string;
};

export type MercadoPagoPayment = {
  id: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  date_approved?: string;
  fee_details?: {
    amount?: number;
    fee_payer?: string;
    type?: string;
  }[];
  transaction_details?: {
    net_received_amount?: number;
    total_paid_amount?: number;
  };
  payer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
};

function getAccessToken() {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado.");
  return token;
}

async function mercadoPagoFetch<T>(path: string, init?: RequestInit) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getAccessToken()}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    message?: string;
    error?: string;
    cause?: { code?: number; description?: string }[];
  };

  if (!response.ok) {
    const cause = body.cause?.[0];
    if (
      cause?.code === 13253 ||
      cause?.description?.includes("Collector user without key enabled")
    ) {
      throw new Error(
        "O Mercado Pago recusou o Pix porque a conta vendedora ainda não tem uma chave Pix habilitada. Ative uma chave Pix na conta produtiva do Mercado Pago e tente novamente.",
      );
    }

    throw new Error(
      cause?.description ??
        body.message ??
        body.error ??
        `Mercado Pago respondeu HTTP ${response.status}.`,
    );
  }

  return body;
}

export async function createPixPayment({
  orderId,
  amountCents,
  description,
  payerEmail,
  payerName,
  notificationUrl,
}: PixPaymentRequest) {
  const [firstName, ...lastNameParts] = payerName.trim().split(/\s+/);

  return mercadoPagoFetch<MercadoPagoPayment>("/v1/payments", {
    method: "POST",
    headers: {
      "X-Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({
      transaction_amount: Number((amountCents / 100).toFixed(2)),
      description,
      payment_method_id: "pix",
      external_reference: orderId,
      notification_url: notificationUrl,
      payer: {
        email: payerEmail,
        first_name: firstName || "Cliente",
        last_name: lastNameParts.join(" ") || "Home Studio",
      },
    }),
  });
}

export async function getPayment(paymentId: string | number) {
  return mercadoPagoFetch<MercadoPagoPayment>(`/v1/payments/${paymentId}`);
}

export function verifyMercadoPagoSignature({
  signature,
  requestId,
  dataId,
}: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
}) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature || !requestId || !dataId) return false;

  const parts = Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key?.trim(), value?.trim()];
    }),
  );
  const ts = parts.ts;
  const hash = parts.v1;
  if (!ts || !hash) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(hash);

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
