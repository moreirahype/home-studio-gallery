import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const notificationSchema = z
  .object({
    action: z.string().optional(),
    type: z.string().optional(),
    data: z.object({ id: z.union([z.string(), z.number()]) }).optional(),
  })
  .passthrough();

export async function POST(request: NextRequest) {
  const parsed = notificationSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Notificação inválida." }, { status: 400 });
  }

  // TODO: validate x-signature, query Mercado Pago and release paid photos.
  return NextResponse.json({ ok: true });
}
