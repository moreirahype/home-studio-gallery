type GallerySale = {
  paymentId: string;
  customerName: string;
  phone: string;
  upsellAmount: number;
  paidAt: string;
  attendantName: string;
  product: "Fotos adicionais" | "Vídeo" | "Novo ensaio";
};

export async function reportGallerySaleToBi(sale: GallerySale) {
  const webhookUrl =
    process.env.HSBI_WEBHOOK_URL ??
    "https://script.google.com/macros/s/AKfycbx2g18eOChWAmiJ7Y-pGYrcyL6fFBFgI_0OeMBSFUVlUdD7sUshIRkw_Lglok4a1-fg/exec";

  if (sale.upsellAmount <= 0) {
    throw new Error("O valor do upsell da galeria deve ser positivo.");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      transaction_id: `gallery-mp-${sale.paymentId}`,
      timestamp: sale.paidAt,
      valor: sale.upsellAmount,
      pagador: sale.customerName,
      telefone: sale.phone,
      moeda: "BRL",
      atendente: sale.attendantName,
      origem: "Home Studio Gallery",
      produto: sale.product,
      webhook_secret: process.env.HSBI_WEBHOOK_SECRET ?? "",
    }),
  });

  const rawBody = await response.text();
  let result: { ok?: boolean; duplicate?: boolean; error?: string } = {};

  try {
    result = JSON.parse(rawBody) as typeof result;
  } catch {
    throw new Error(
      `Home Studio BI retornou uma resposta invalida (HTTP ${response.status}).`,
    );
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      result.error ?? `Home Studio BI respondeu HTTP ${response.status}.`,
    );
  }

  return result as { ok: true; duplicate?: boolean };
}
