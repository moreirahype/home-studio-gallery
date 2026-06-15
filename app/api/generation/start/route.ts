import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { startProjectGeneration } from "@/lib/generation";
import { unauthorized } from "@/lib/http";
import { safeCompare } from "@/lib/security";

const requestSchema = z.object({
  projectId: z.string().uuid(),
  count: z.coerce.number().int().min(1).max(15).optional().default(1),
});

export async function POST(request: NextRequest) {
  if (
    !safeCompare(
      request.headers.get("x-webhook-secret"),
      process.env.GENERATION_SECRET ?? process.env.ZAPDATA_WEBHOOK_SECRET,
    )
  ) {
    return unauthorized();
  }

  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Pedido de geração inválido." },
      { status: 400 },
    );
  }

  try {
    const result = await startProjectGeneration({
      projectId: parsed.data.projectId,
      limit: parsed.data.count,
      appUrl: process.env.APP_URL ?? request.nextUrl.origin,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha na geração.",
      },
      { status: 500 },
    );
  }
}
