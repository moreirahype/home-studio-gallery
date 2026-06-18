import { cache } from "react";
import { isGalleryExpired } from "@/lib/gallery-expiration";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type ProjectRow = {
  id: string;
  gallery_token: string;
  included_photos: number;
  paid_amount_cents: number;
  status: string;
  customer_name: string | null;
  generation_count?: number;
  created_at?: string;
  expires_at?: string | null;
};

export const getProjectByToken = cache(async (galleryToken: string) => {
  const supabase = getSupabaseAdmin();
  let data: ProjectRow | null = null;
  let error: { code?: string; message: string } | null = null;
  const primary = await supabase
    .from("projects")
    .select(
      "id, gallery_token, included_photos, paid_amount_cents, status, customer_name, generation_count, created_at, expires_at",
    )
    .eq("gallery_token", galleryToken)
    .maybeSingle();
  data = primary.data;
  error = primary.error;

  if (
    error?.code === "42703" ||
    error?.message.includes("generation_count") ||
    error?.message.includes("expires_at")
  ) {
    const fallback = await supabase
      .from("projects")
      .select(
        "id, gallery_token, included_photos, paid_amount_cents, status, customer_name, created_at",
      )
      .eq("gallery_token", galleryToken)
      .maybeSingle();
    data = fallback.data ? { ...fallback.data, generation_count: 15 } : null;
    error = fallback.error;
  }

  if (error) {
    throw new Error(`Não foi possível carregar a galeria: ${error.message}`);
  }

  if (!data) return data;
  if (isGalleryExpired(data.created_at, data.expires_at)) return null;

  return loadProjectPhotos(data);
});

async function loadProjectPhotos(data: ProjectRow) {
  const supabase = getSupabaseAdmin();
  const { data: photos, error: photosError } = await supabase
    .from("photos")
    .select("id, position, preview_path, status")
    .eq("project_id", data.id)
    .order("position");

  if (photosError) {
    throw new Error(`Não foi possível carregar as fotos: ${photosError.message}`);
  }

  const readyPhotos = (photos ?? []).filter(
    (photo) => photo.status === "ready" && photo.preview_path,
  );
  const signedPreviews = readyPhotos.length
    ? await supabase.storage
        .from("photo-previews")
        .createSignedUrls(
          readyPhotos.map((photo) => photo.preview_path as string),
          60 * 60,
        )
    : { data: [], error: null };

  if (signedPreviews.error) {
    throw new Error(
      `Não foi possível abrir as prévias: ${signedPreviews.error.message}`,
    );
  }

  return {
    ...data,
    generation_count: Math.max(
      data.included_photos,
      data.generation_count ?? photos?.length ?? 15,
    ),
    photos: readyPhotos.map((photo, index) => ({
      id: photo.id,
      number: photo.position,
      previewUrl: signedPreviews.data[index]?.signedUrl ?? "",
    })),
  };
}
