import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { unauthorized } from "@/lib/http";
import { safeCompare } from "@/lib/security";

const requestSchema = z.object({
  taskId: z.string().min(8),
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

  if (!parsed.success || !process.env.KIE_CALLBACK_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Pedido de recuperação inválido." },
      { status: 400 },
    );
  }

  const callbackUrl = new URL(
    "/api/webhooks/kie",
    process.env.APP_URL ?? request.nextUrl.origin,
  );
  callbackUrl.searchParams.set("secret", process.env.KIE_CALLBACK_SECRET);
  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId: parsed.data.taskId }),
  });
  const result = await response.json();

  return NextResponse.json(result, { status: response.status });
}
