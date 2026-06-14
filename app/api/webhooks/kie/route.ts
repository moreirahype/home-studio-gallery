import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { unauthorized } from "@/lib/http";
import { safeCompare } from "@/lib/security";

const callbackSchema = z
  .object({
    taskId: z.string().min(1),
    state: z.string().optional(),
    resultUrls: z.array(z.string().url()).optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");

  if (!safeCompare(secret, process.env.KIE_CALLBACK_SECRET)) {
    return unauthorized();
  }

  const parsed = callbackSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Callback inválido." }, { status: 400 });
  }

  // TODO: download originals, create watermarked previews and update the project.
  return NextResponse.json({ ok: true, taskId: parsed.data.taskId });
}
