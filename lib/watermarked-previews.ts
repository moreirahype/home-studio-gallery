import { createWatermarkedPreview } from "@/lib/photo-processing";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

type ReadyPhoto = {
  id: string;
  project_id: string;
  position: number;
  original_path: string | null;
  preview_path: string | null;
};

export async function ensureWatermarkedPreviews({
  supabase,
  projectId,
  photoIds,
}: {
  supabase: SupabaseAdmin;
  projectId: string;
  photoIds: string[];
}) {
  const uniquePhotoIds = [...new Set(photoIds)];
  if (!uniquePhotoIds.length) return [];

  const { data: photos, error } = await supabase
    .from("photos")
    .select("id, project_id, position, original_path, preview_path")
    .eq("project_id", projectId)
    .eq("status", "ready")
    .in("id", uniquePhotoIds)
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);

  const updated = [];

  for (const photo of (photos ?? []) as ReadyPhoto[]) {
    if (!photo.original_path) continue;

    const originalDownload = await supabase.storage
      .from("photo-originals")
      .download(photo.original_path);

    if (originalDownload.error || !originalDownload.data) {
      throw new Error(
        originalDownload.error?.message ?? "Nao foi possivel abrir a foto original.",
      );
    }

    const original = Buffer.from(await originalDownload.data.arrayBuffer());
    const preview = await createWatermarkedPreview(original);
    const previewPath =
      photo.preview_path ||
      `${photo.project_id}/${String(photo.position).padStart(2, "0")}.webp`;
    const previewUpload = await supabase.storage
      .from("photo-previews")
      .upload(previewPath, preview, {
        contentType: "image/webp",
        cacheControl: "0",
        upsert: true,
      });

    if (previewUpload.error) {
      throw new Error(previewUpload.error.message);
    }

    const { error: updateError } = await supabase
      .from("photos")
      .update({ preview_path: previewPath })
      .eq("id", photo.id);

    if (updateError) throw new Error(updateError.message);

    updated.push({
      photoId: photo.id,
      number: photo.position,
      previewPath,
    });
  }

  if (!updated.length) return [];

  const signed = await supabase.storage
    .from("photo-previews")
    .createSignedUrls(
      updated.map((photo) => photo.previewPath),
      60 * 60,
    );

  if (signed.error) throw new Error(signed.error.message);

  return updated.map((photo, index) => ({
    photoId: photo.photoId,
    number: photo.number,
    previewUrl: signed.data[index]?.signedUrl ?? "",
  }));
}
