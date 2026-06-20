import { z } from "zod";

export const zapdataOfferSchema = z.object({
  contactId: z.string().min(1).optional(),
  contactName: z.string().min(1).optional(),
  phone: z.string().min(8).optional(),
  sourceImageUrl: z.string().optional(),
  foto_cliente: z.string().optional(),
  contextFinal: z.string().optional(),
  contexto_final: z.string().optional(),
  nicheId: z.string().min(1).optional().default("geral"),
  nicho: z.string().min(1).optional(),
  includedPhotos: z.coerce.number().int().min(1).max(20).optional().default(1),
  paidAmount: z.coerce.number().positive().optional().default(7.9),
  pricingBaseAmount: z.coerce.number().positive().optional(),
  generationCount: z.coerce.number().int().min(1).max(20).optional().default(15),
  productName: z.string().trim().min(1).max(120).optional(),
  produto: z.string().trim().min(1).max(120).optional(),
  receiptId: z.string().min(1).optional(),
  testMode: z.coerce.boolean().optional().default(false),
  leadToken: z.string().min(8).optional(),
});

type ZapdataPayloadInput = z.input<typeof zapdataOfferSchema>;

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function readNumberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const normalized = Number(value.replace(",", "."));
    return Number.isFinite(normalized) ? normalized : undefined;
  }
  return undefined;
}

export function normalizeZapdataPayload(
  payload: unknown,
): Partial<ZapdataPayloadInput> {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const data = payload as Record<string, unknown>;
  const variables =
    data.variables && typeof data.variables === "object"
      ? (data.variables as Record<string, unknown>)
      : {};
  const flowVariables =
    data.flow_variables && typeof data.flow_variables === "object"
      ? (data.flow_variables as Record<string, unknown>)
      : {};
  const contact =
    data.contact && typeof data.contact === "object"
      ? (data.contact as Record<string, unknown>)
      : {};

  return {
    ...data,
    contactId:
      readText(data.contactId) ??
      readText(contact.id),
    contactName:
      readText(data.contactName) ??
      readText(contact.name) ??
      readText(flowVariables.contactName),
    phone:
      readText(data.phone) ??
      readText(data.telefone) ??
      readText(variables.telefone) ??
      readText(flowVariables.telefone) ??
      readText(contact.phone),
    sourceImageUrl:
      readText(data.sourceImageUrl) ??
      readText(data.foto_cliente) ??
      readText(variables.foto_cliente) ??
      readText(flowVariables.foto_cliente),
    foto_cliente:
      readText(data.foto_cliente) ??
      readText(variables.foto_cliente) ??
      readText(flowVariables.foto_cliente),
    contextFinal:
      readText(data.contextFinal) ??
      readText(data.contexto_final) ??
      readText(variables.contexto_final) ??
      readText(flowVariables.contexto_final),
    contexto_final:
      readText(data.contexto_final) ??
      readText(variables.contexto_final) ??
      readText(flowVariables.contexto_final),
    nicho:
      readText(data.nicho) ??
      readText(variables.nicho) ??
      readText(flowVariables.nicho),
    includedPhotos:
      readNumberValue(data.includedPhotos) ??
      readNumberValue(variables.includedPhotos) ??
      readNumberValue(flowVariables.includedPhotos),
    paidAmount:
      readNumberValue(data.paidAmount) ??
      readNumberValue(variables.paidAmount) ??
      readNumberValue(flowVariables.paidAmount),
    pricingBaseAmount:
      readNumberValue(data.pricingBaseAmount) ??
      readNumberValue(data.pricing_base_amount) ??
      readNumberValue(data.upsellBaseAmount) ??
      readNumberValue(data.upsell_base_amount) ??
      readNumberValue(data.galleryPricingBaseAmount) ??
      readNumberValue(data.gallery_pricing_base_amount) ??
      readNumberValue(data.valorBaseUpsell) ??
      readNumberValue(data.valor_base_upsell) ??
      readNumberValue(data.valorTabela) ??
      readNumberValue(data.valor_tabela) ??
      readNumberValue(variables.pricingBaseAmount) ??
      readNumberValue(variables.pricing_base_amount) ??
      readNumberValue(variables.upsellBaseAmount) ??
      readNumberValue(variables.upsell_base_amount) ??
      readNumberValue(variables.galleryPricingBaseAmount) ??
      readNumberValue(variables.gallery_pricing_base_amount) ??
      readNumberValue(variables.valorBaseUpsell) ??
      readNumberValue(variables.valor_base_upsell) ??
      readNumberValue(variables.valorTabela) ??
      readNumberValue(variables.valor_tabela) ??
      readNumberValue(flowVariables.pricingBaseAmount) ??
      readNumberValue(flowVariables.pricing_base_amount) ??
      readNumberValue(flowVariables.upsellBaseAmount) ??
      readNumberValue(flowVariables.upsell_base_amount) ??
      readNumberValue(flowVariables.galleryPricingBaseAmount) ??
      readNumberValue(flowVariables.gallery_pricing_base_amount) ??
      readNumberValue(flowVariables.valorBaseUpsell) ??
      readNumberValue(flowVariables.valor_base_upsell) ??
      readNumberValue(flowVariables.valorTabela) ??
      readNumberValue(flowVariables.valor_tabela),
    generationCount:
      readNumberValue(data.generationCount) ??
      readNumberValue(variables.generationCount) ??
      readNumberValue(flowVariables.generationCount),
    productName:
      readText(data.productName) ??
      readText(data.product_name) ??
      readText(data.product) ??
      readText(data.produto) ??
      readText(variables.productName) ??
      readText(variables.product_name) ??
      readText(variables.product) ??
      readText(variables.produto) ??
      readText(flowVariables.productName) ??
      readText(flowVariables.product_name) ??
      readText(flowVariables.product) ??
      readText(flowVariables.produto) ??
      readText(data.nicho) ??
      readText(variables.nicho) ??
      readText(flowVariables.nicho),
    produto:
      readText(data.produto) ??
      readText(variables.produto) ??
      readText(flowVariables.produto),
    leadToken:
      readText(data.leadToken) ??
      readText(variables.leadToken) ??
      readText(flowVariables.leadToken),
  };
}

export function defaultGalleryAttendant({
  amount,
  productName,
}: {
  amount: number;
  productName: string;
}) {
  const normalizedProduct = productName.trim() || "Geral";
  const prefixedProduct = normalizedProduct
    .toLowerCase()
    .startsWith("galeria")
    ? normalizedProduct
    : `Galeria ${normalizedProduct}`;
  return `${prefixedProduct} ${amount.toFixed(2)}`;
}

export function previewValue(value?: string) {
  if (!value) return null;
  return value.length > 220 ? `${value.slice(0, 220)}...` : value;
}
