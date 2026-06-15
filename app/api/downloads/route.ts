import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const requestSchema = z.object({
  galleryToken: z.string().min(8),
  photoIds: z.array(z.string().min(1)).min(1).max(20),
});

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
  let authorized = uniquePhotoIds.length <= project.included_photos;

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

  const signed = await supabase.storage
    .from("photo-originals")
    .createSignedUrls(
      photos.map((photo) => photo.original_path as string),
      60 * 15,
      { download: true },
    );

  if (signed.error) {
    return NextResponse.json(
      { ok: false, error: signed.error.message },
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
    })),
  });
}
