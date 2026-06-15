import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const getProjectByToken = cache(async (galleryToken: string) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, gallery_token, included_photos, paid_amount_cents, generation_count, status, customer_name",
    )
    .eq("gallery_token", galleryToken)
    .maybeSingle();

  if (error?.code === "42703" || error?.message.includes("generation_count")) {
    const fallback = await supabase
      .from("projects")
      .select(
        "id, gallery_token, included_photos, paid_amount_cents, status, customer_name",
      )
      .eq("gallery_token", galleryToken)
      .maybeSingle();

    if (fallback.error) {
      throw new Error(
        `Não foi possível carregar a galeria: ${fallback.error.message}`,
      );
    }

    return fallback.data
      ? { ...fallback.data, generation_count: 15, photos: [] }
      : fallback.data;
  }

  if (error) {
    throw new Error(`Não foi possível carregar a galeria: ${error.message}`);
  }

  if (!data) return data;

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
    photos: readyPhotos.map((photo, index) => ({
      id: photo.id,
      number: photo.position,
      previewUrl: signedPreviews.data[index]?.signedUrl ?? "",
    })),
  };
});
