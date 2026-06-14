type GallerySale = {
  paymentId: string;
  customerName: string;
  phone: string;
  upsellAmount: number;
  paidAt: string;
};

export async function reportGallerySaleToBi(sale: GallerySale) {
  const webhookUrl = process.env.HSBI_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("HSBI_WEBHOOK_URL não configurada.");
  }

  if (sale.upsellAmount <= 0) {
    throw new Error("O valor do upsell da galeria deve ser positivo.");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: `gallery-mp-${sale.paymentId}`,
      timestamp: sale.paidAt,
      valor: sale.upsellAmount,
      pagador: sale.customerName,
      telefone: sale.phone,
      moeda: "BRL",
      atendente: "Galeria",
      origem: "Home Studio Gallery",
      webhook_secret: process.env.HSBI_WEBHOOK_SECRET ?? "",
    }),
  });

  if (!response.ok) {
    throw new Error(`Home Studio BI respondeu HTTP ${response.status}.`);
  }

  return response.json() as Promise<{ ok: boolean; duplicate?: boolean }>;
}
