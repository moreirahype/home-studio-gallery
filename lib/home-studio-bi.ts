type GallerySale = {
  paymentId: string;
  customerName: string;
  phone: string;
  amount: number;
  paidAt: string;
};

export async function reportGallerySaleToBi(sale: GallerySale) {
  const webhookUrl = process.env.HSBI_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("HSBI_WEBHOOK_URL não configurada.");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: `gallery-mp-${sale.paymentId}`,
      timestamp: sale.paidAt,
      valor: sale.amount,
      pagador: sale.customerName,
      telefone: sale.phone,
      moeda: "BRL",
      atendente: "Automação",
      origem: "Home Studio Gallery",
      webhook_secret: process.env.HSBI_WEBHOOK_SECRET ?? "",
    }),
  });

  if (!response.ok) {
    throw new Error(`Home Studio BI respondeu HTTP ${response.status}.`);
  }

  return response.json() as Promise<{ ok: boolean; duplicate?: boolean }>;
}
