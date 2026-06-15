import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { unauthorized } from "@/lib/http";
import { safeCompare } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { startVideoJob } from "@/lib/video";

const requestSchema = z.object({
  galleryToken: z.string().min(8),
  photoIds: z.array(z.string().min(1)).min(1).max(3),
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
      { ok: false, error: "Pedido de vídeo inválido." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("gallery_token", parsed.data.galleryToken)
    .maybeSingle();

  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Galeria não encontrada." },
      { status: 404 },
    );
  }

  try {
    const result = await startVideoJob({
      projectId: project.id,
      photoIds: parsed.data.photoIds,
      appUrl: process.env.APP_URL ?? request.nextUrl.origin,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao criar vídeo.",
      },
      { status: 500 },
    );
  }
}
