import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { unauthorized } from "@/lib/http";
import { safeCompare } from "@/lib/security";
import { validatePublicImageUrl } from "@/lib/source-image";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const requestSchema = z.object({
  galleryToken: z.string().min(8).optional(),
  projectId: z.string().uuid().optional(),
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

  if (!parsed.success || (!parsed.data.galleryToken && !parsed.data.projectId)) {
    return NextResponse.json(
      { ok: false, error: "Informe galleryToken ou projectId." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("projects")
    .select(
      "id, gallery_token, status, source_image_url, context_final, generation_count, included_photos, created_at",
    );

  query = parsed.data.projectId
    ? query.eq("id", parsed.data.projectId)
    : query.eq("gallery_token", parsed.data.galleryToken);

  const { data: project, error: projectError } = await query.maybeSingle();

  if (projectError) {
    return NextResponse.json(
      { ok: false, error: projectError.message },
      { status: 500 },
    );
  }

  if (!project) {
    return NextResponse.json({
      ok: true,
      found: false,
      galleryToken: parsed.data.galleryToken,
      projectId: parsed.data.projectId,
    });
  }

  const { data: photos, error: photosError } = await supabase
    .from("photos")
    .select(
      "id, position, status, kie_task_id, original_path, preview_path, error_message, created_at, updated_at",
    )
    .eq("project_id", project.id)
    .order("position");

  if (photosError) {
    return NextResponse.json(
      { ok: false, error: photosError.message },
      { status: 500 },
    );
  }

  const sourceImage = await validatePublicImageUrl(
    project.source_image_url as string,
  );
  const counts = (photos ?? []).reduce<Record<string, number>>((acc, photo) => {
    acc[photo.status as string] = (acc[photo.status as string] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    ok: true,
    found: true,
    project: {
      id: project.id,
      galleryToken: project.gallery_token,
      status: project.status,
      createdAt: project.created_at,
      generationCount: project.generation_count,
      includedPhotos: project.included_photos,
      contextFinal: project.context_final,
      sourceImageUrl: project.source_image_url,
      sourceImagePublic: sourceImage.ok,
      sourceImageError: sourceImage.ok ? null : sourceImage.error,
    },
    counts,
    photos: (photos ?? []).map((photo) => ({
      id: photo.id,
      position: photo.position,
      status: photo.status,
      taskId: photo.kie_task_id,
      hasOriginal: Boolean(photo.original_path),
      hasPreview: Boolean(photo.preview_path),
      errorMessage: photo.error_message,
    })),
  });
}
