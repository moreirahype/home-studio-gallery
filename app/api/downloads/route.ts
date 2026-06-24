import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isGalleryExpired } from "@/lib/gallery-expiration";
import { safeCompare } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const requestSchema = z.object({
  galleryToken: z.string().min(8),
  photoIds: z.array(z.string().min(1)).min(1).max(20),
  manualPassword: z.string().optional(),
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

async function markManualRelease({
  supabase,
  projectId,
  photoIds,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  projectId: string;
  photoIds: string[];
}) {
  const { error } = await supabase.from("project_included_photos").upsert(
    photoIds.map((photoId) => ({
      project_id: projectId,
      photo_id: photoId,
    })),
    { onConflict: "project_id,photo_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
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
  let { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, included_photos, created_at, expires_at")
    .eq("gallery_token", parsed.data.galleryToken)
    .maybeSingle();

  if (projectError && projectError.code === "42703") {
    const fallback = await supabase
      .from("projects")
      .select("id, included_photos, created_at")
      .eq("gallery_token", parsed.data.galleryToken)
      .maybeSingle();
    project = fallback.data ? { ...fallback.data, expires_at: null } : null;
    projectError = fallback.error;
  }

  if (projectError) {
    return NextResponse.json(
      { ok: false, error: projectError.message },
      { status: 500 },
    );
  }

  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Galeria não encontrada." },
      { status: 404 },
    );
  }

  if (isGalleryExpired(project.created_at, project.expires_at)) {
    return NextResponse.json(
      { ok: false, error: "Esta galeria expirou." },
      { status: 410 },
    );
  }

  const uniquePhotoIds = [...new Set(parsed.data.photoIds)];
  const manualReleasePassword =
    process.env.GALLERY_MANUAL_RELEASE_PASSWORD ??
    process.env.MANUAL_RELEASE_PASSWORD;
  const manualReleaseRequested = Boolean(parsed.data.manualPassword);
  const manualReleaseAuthorized =
    manualReleaseRequested &&
    safeCompare(parsed.data.manualPassword ?? null, manualReleasePassword);
  let authorized = false;

  if (manualReleaseRequested && !manualReleaseAuthorized) {
    return NextResponse.json(
      { ok: false, error: "Senha de liberação inválida." },
      { status: 403 },
    );
  }

  if (manualReleaseAuthorized) {
    authorized = true;
  } else if (uniquePhotoIds.length <= project.included_photos) {
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
              : "Não foi possível liberar a foto incluída.",
        },
        { status: 500 },
      );
    }
  }

  if (!authorized) {
    const [claimResult, paidResult] = await Promise.all([
      supabase
        .from("project_included_photos")
        .select("photo_id")
        .eq("project_id", project.id)
        .in("photo_id", uniquePhotoIds),
      supabase
        .from("order_photos")
        .select("photo_id, orders!inner(status, project_id)")
        .eq("orders.project_id", project.id)
        .eq("orders.status", "paid")
        .in("photo_id", uniquePhotoIds),
    ]);

    if (
      claimResult.error &&
      !["42P01", "PGRST205"].includes(claimResult.error.code ?? "")
    ) {
      return NextResponse.json(
        { ok: false, error: claimResult.error.message },
        { status: 500 },
      );
    }

    if (paidResult.error) {
      return NextResponse.json(
        { ok: false, error: paidResult.error.message },
        { status: 500 },
      );
    }

    const accessiblePhotoIds = new Set([
      ...(claimResult.data ?? []).map((row) => row.photo_id as string),
      ...(paidResult.data ?? []).map((row) => row.photo_id as string),
    ]);
    authorized = uniquePhotoIds.every((photoId) =>
      accessiblePhotoIds.has(photoId),
    );
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
    .eq("status", "ready")
    .order("position", { ascending: true });

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

  if (manualReleaseAuthorized) {
    try {
      await markManualRelease({
        supabase,
        projectId: project.id,
        photoIds: uniquePhotoIds,
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Não foi possível salvar a liberação manual.",
        },
        { status: 500 },
      );
    }
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
