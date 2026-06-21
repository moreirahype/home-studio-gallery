import { z } from "zod";

export const zapdataOfferSchema = z.object({
  contactId: z.string().min(1).optional(),
  contactName: z.string().min(1).optional(),
  phone: z.string().min(8).optional(),
  sourceImageUrl: z.string().optional(),
  foto_cliente: z.string().optional(),
  contextFinal: z.string().optional(),
  contexto_inicial: z.string().optional(),
  initialContext: z.string().optional(),
  contexto_final: z.string().optional(),
  nicheId: z.string().min(1).optional().default("geral"),
  nicho: z.string().min(1).optional(),
  includedPhotos: z.coerce.number().int().min(1).max(20).optional().default(1),
  paidAmount: z.coerce.number().positive().optional().default(7.9),
  firstExtraAmount: z.coerce.number().positive().optional(),
  generationCount: z.coerce.number().int().min(1).max(20).optional().default(15),
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
    initialContext:
      readText(data.initialContext) ??
      readText(data.contexto_inicial) ??
      readText(variables.contexto_inicial) ??
      readText(flowVariables.contexto_inicial) ??
      readText(data.resposta1) ??
      readText(variables.resposta1) ??
      readText(flowVariables.resposta1),
    contexto_inicial:
      readText(data.contexto_inicial) ??
      readText(variables.contexto_inicial) ??
      readText(flowVariables.contexto_inicial) ??
      readText(data.resposta1) ??
      readText(variables.resposta1) ??
      readText(flowVariables.resposta1),
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
    firstExtraAmount:
      readNumberValue(data.firstExtraAmount) ??
      readNumberValue(data.first_extra_amount) ??
      readNumberValue(data.extraPhotoAmount) ??
      readNumberValue(data.extra_photo_amount) ??
      readNumberValue(data.primeiraFotoExtra) ??
      readNumberValue(data.primeira_foto_extra) ??
      readNumberValue(variables.firstExtraAmount) ??
      readNumberValue(variables.first_extra_amount) ??
      readNumberValue(variables.extraPhotoAmount) ??
      readNumberValue(variables.extra_photo_amount) ??
      readNumberValue(variables.primeiraFotoExtra) ??
      readNumberValue(variables.primeira_foto_extra) ??
      readNumberValue(flowVariables.firstExtraAmount) ??
      readNumberValue(flowVariables.first_extra_amount) ??
      readNumberValue(flowVariables.extraPhotoAmount) ??
      readNumberValue(flowVariables.extra_photo_amount) ??
      readNumberValue(flowVariables.primeiraFotoExtra) ??
      readNumberValue(flowVariables.primeira_foto_extra),
    generationCount:
      readNumberValue(data.generationCount) ??
      readNumberValue(variables.generationCount) ??
      readNumberValue(flowVariables.generationCount),
    leadToken:
      readText(data.leadToken) ??
      readText(variables.leadToken) ??
      readText(flowVariables.leadToken),
  };
}

export function defaultGalleryAttendant({
  amount,
}: {
  amount: number;
}) {
  return `Galeria ${amount.toFixed(2)}`;
}

export function previewValue(value?: string) {
  if (!value) return null;
  return value.length > 220 ? `${value.slice(0, 220)}...` : value;
}
