import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { unauthorized } from "@/lib/http";
import { buildGenerationPrompts } from "@/lib/prompt-builder";
import { safeCompare } from "@/lib/security";

const payloadSchema = z.object({
  contactId: z.string().min(1),
  contactName: z.string().min(1),
  phone: z.string().min(8),
  sourceImageUrl: z.string().url().optional(),
  foto_cliente: z.string().url().optional(),
  contextFinal: z.string().min(3).optional(),
  contexto_final: z.string().min(3).optional(),
  nicheId: z.string().min(1).optional().default("geral"),
  nicho: z.string().min(1).optional(),
  includedPhotos: z.coerce.number().int().min(1).max(20).optional().default(1),
  paidAmount: z.coerce.number().positive().optional().default(4.9),
  receiptId: z.string().min(1),
}).superRefine((payload, context) => {
  if (!payload.sourceImageUrl && !payload.foto_cliente) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Informe sourceImageUrl ou foto_cliente.",
      path: ["foto_cliente"],
    });
  }

  if (!payload.contextFinal && !payload.contexto_final) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Informe contextFinal ou contexto_final.",
      path: ["contexto_final"],
    });
  }
});

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");

  if (!safeCompare(secret, process.env.ZAPDATA_WEBHOOK_SECRET)) {
    return unauthorized();
  }

  const parsed = payloadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const projectId = randomUUID();
  const galleryToken = randomUUID().replaceAll("-", "");
  const appUrl = process.env.APP_URL ?? request.nextUrl.origin;
  const sourceImageUrl = parsed.data.sourceImageUrl ?? parsed.data.foto_cliente;
  const contextFinal = parsed.data.contextFinal ?? parsed.data.contexto_final;
  const nicheId = parsed.data.nicho ?? parsed.data.nicheId;
  const generationPrompts = buildGenerationPrompts(contextFinal!);
  const isTestMode = process.env.TEST_MODE === "true";
  const galleryUrl = new URL(
    `/g/${isTestMode ? "demo" : galleryToken}`,
    appUrl,
  );

  if (isTestMode) {
    galleryUrl.searchParams.set(
      "paidAmount",
      String(parsed.data.paidAmount),
    );
    galleryUrl.searchParams.set(
      "includedPhotos",
      String(parsed.data.includedPhotos),
    );
    galleryUrl.searchParams.set("test", "1");
  }

  // TODO: persist the project, download sourceImageUrl and enqueue generationPrompts.
  return NextResponse.json({
    ok: true,
    projectId,
    status: "queued",
    galleryUrl: galleryUrl.toString(),
    testMode: isTestMode,
    includedPhotos: parsed.data.includedPhotos,
    generationPlan: {
      count: generationPrompts.length,
      nicheId,
      sourceImageUrl,
      contextFinal,
    },
  });
}
