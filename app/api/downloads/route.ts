import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const requestSchema = z.object({
  galleryToken: z.string().min(8),
  photoIds: z.array(z.string().min(1)).min(1).max(20),
});

async function authorizeIncludedPhotos({
  supabase,
  projectId,
  includedPhotos,
  photoIds,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  projectId: string;
  includedPhotos: number;
  photoIds: string[];
}) {
  const { data: existingClaims, error } = await supabase
    .from("project_included_photos")
    .select("photo_id")
    .eq("project_id", projectId);

  if (error) {
    if (["42P01", "PGRST205"].includes(error.code ?? "")) {
      return photoIds.length <= includedPhotos;
    }
    throw new Error(error.message);
  }

  const claimedPhotoIds = new Set(
    (existingClaims ?? []).map((claim) => claim.photo_id as string),
  );
  const mergedPhotoIds = new Set([...claimedPhotoIds, ...photoIds]);

  if (mergedPhotoIds.size > includedPhotos) {
    return photoIds.every((photoId) => claimedPhotoIds.has(photoId));
  }

  const newClaims = photoIds
    .filter((photoId) => !claimedPhotoIds.has(photoId))
    .map((photoId) => ({
      project_id: projectId,
      photo_id: photoId,
    }));

  if (newClaims.length) {
    const { error: insertError } = await supabase
      .from("project_included_photos")
      .insert(newClaims);

    if (insertError && insertError.code !== "23505") {
      throw new Error(insertError.message);
    }
  }

  return true;
}

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Seleção inválida." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: project } = await supabase
    .from("projects")
    .select("id, included_photos")
    .eq("gallery_token", parsed.data.galleryToken)
    .maybeSingle();

  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Galeria não encontrada." },
      { status: 404 },
    );
  }

  const uniquePhotoIds = [...new Set(parsed.data.photoIds)];
  let authorized = false;

  if (uniquePhotoIds.length <= project.included_photos) {
    try {
      authorized = await authorizeIncludedPhotos({
        supabase,
        projectId: project.id,
        includedPhotos: project.included_photos,
        photoIds: uniquePhotoIds,
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Nao foi possivel liberar a foto incluida.",
        },
        { status: 500 },
      );
    }
  }

  if (!authorized) {
    const { data: paidPhotos } = await supabase
      .from("order_photos")
      .select("photo_id, orders!inner(status, project_id)")
      .eq("orders.project_id", project.id)
      .eq("orders.status", "paid")
      .in("photo_id", uniquePhotoIds);
    authorized = new Set((paidPhotos ?? []).map((row) => row.photo_id)).size ===
      uniquePhotoIds.length;
  }

  if (!authorized) {
    return NextResponse.json(
      { ok: false, error: "Estas fotos ainda não foram liberadas." },
      { status: 403 },
    );
  }

  const { data: photos, error } = await supabase
    .from("photos")
    .select("id, position, original_path")
    .eq("project_id", project.id)
    .in("id", uniquePhotoIds)
    .eq("status", "ready");

  if (error || !photos || photos.length !== uniquePhotoIds.length) {
    return NextResponse.json(
      { ok: false, error: "Alguma foto ainda não está pronta." },
      { status: 409 },
    );
  }

  const [signed, views] = await Promise.all([
    supabase.storage
      .from("photo-originals")
      .createSignedUrls(
        photos.map((photo) => photo.original_path as string),
        60 * 15,
        { download: true },
      ),
    supabase.storage
      .from("photo-originals")
      .createSignedUrls(
        photos.map((photo) => photo.original_path as string),
        60 * 60,
      ),
  ]);

  if (signed.error || views.error) {
    return NextResponse.json(
      { ok: false, error: signed.error?.message ?? views.error?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    expiresIn: 900,
    downloads: photos.map((photo, index) => ({
      photoId: photo.id,
      number: photo.position,
      url: signed.data[index]?.signedUrl,
      viewUrl: views.data[index]?.signedUrl,
    })),
  });
}
