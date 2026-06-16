import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { startProjectGeneration } from "@/lib/generation";
import { unauthorized } from "@/lib/http";
import { safeCompare } from "@/lib/security";
import { validatePublicImageUrl } from "@/lib/source-image";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const requestSchema = z.object({
  projectId: z.string().uuid().optional(),
  galleryToken: z.string().min(8).optional(),
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

  if (!parsed.success || (!parsed.data.projectId && !parsed.data.galleryToken)) {
    return NextResponse.json(
      { ok: false, error: "Pedido de geracao invalido." },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    let projectId = parsed.data.projectId;

    if (!projectId && parsed.data.galleryToken) {
      const { data: project } = await supabase
        .from("projects")
        .select("id")
        .eq("gallery_token", parsed.data.galleryToken)
        .maybeSingle();
      projectId = project?.id;
    }

    if (!projectId) {
      return NextResponse.json(
        { ok: false, error: "Galeria nao encontrada." },
        { status: 404 },
      );
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("source_image_url")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { ok: false, error: "Projeto nao encontrado." },
        { status: 404 },
      );
    }

    const sourceImageValidation = await validatePublicImageUrl(
      project.source_image_url,
    );

    if (!sourceImageValidation.ok) {
      return NextResponse.json(
        { ok: false, error: sourceImageValidation.error },
        { status: 400 },
      );
    }

    const result = await startProjectGeneration({
      projectId,
      limit: parsed.data.count,
      appUrl: process.env.APP_URL ?? request.nextUrl.origin,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha na geracao.",
      },
      { status: 500 },
    );
  }
}
