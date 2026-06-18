import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const querySchema = z.object({
  token: z.string().min(8),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    token: request.nextUrl.searchParams.get("token"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Galeria invalida." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: project } = await supabase
    .from("projects")
    .select("id, paid_amount_cents")
    .eq("gallery_token", parsed.data.token)
    .maybeSingle();

  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Galeria nao encontrada." },
      { status: 404 },
    );
  }

  const unlockedPhotoIds = new Set<string>();
  const claims = await supabase
    .from("project_included_photos")
    .select("photo_id")
    .eq("project_id", project.id);

  if (claims.error && !["42P01", "PGRST205"].includes(claims.error.code ?? "")) {
    return NextResponse.json(
      { ok: false, error: claims.error.message },
      { status: 500 },
    );
  }

  for (const claim of claims.data ?? []) {
    unlockedPhotoIds.add(claim.photo_id as string);
  }

  const { data: paidPhotos, error: paidError } = await supabase
    .from("order_photos")
    .select("photo_id, orders!inner(status, project_id)")
    .eq("orders.project_id", project.id)
    .eq("orders.status", "paid");

  if (paidError) {
    return NextResponse.json(
      { ok: false, error: paidError.message },
      { status: 500 },
    );
  }

  for (const row of paidPhotos ?? []) {
    unlockedPhotoIds.add(row.photo_id as string);
  }

  const { data: paidPhotoItems, error: itemsError } = await supabase
    .from("order_items")
    .select("amount_cents, orders!inner(status, project_id)")
    .eq("kind", "photos")
    .eq("orders.project_id", project.id)
    .eq("orders.status", "paid");

  if (itemsError) {
    return NextResponse.json(
      { ok: false, error: itemsError.message },
      { status: 500 },
    );
  }

  const photoCreditCents = (paidPhotoItems ?? []).reduce(
    (total, item) => total + Number(item.amount_cents || 0),
    project.paid_amount_cents,
  );

  const { data: photos, error: photosError } = unlockedPhotoIds.size
    ? await supabase
        .from("photos")
        .select("id, position, original_path")
        .eq("project_id", project.id)
        .eq("status", "ready")
        .in("id", [...unlockedPhotoIds])
    : { data: [], error: null };

  if (photosError) {
    return NextResponse.json(
      { ok: false, error: photosError.message },
      { status: 500 },
    );
  }

  const validPhotos = (photos ?? []).filter((photo) => photo.original_path);
  const [viewLinks, downloadLinks] = validPhotos.length
    ? await Promise.all([
        supabase.storage
          .from("photo-originals")
          .createSignedUrls(
            validPhotos.map((photo) => photo.original_path as string),
            60 * 60,
          ),
        supabase.storage
          .from("photo-originals")
          .createSignedUrls(
            validPhotos.map((photo) => photo.original_path as string),
            60 * 15,
            { download: true },
          ),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (viewLinks.error || downloadLinks.error) {
    return NextResponse.json(
      {
        ok: false,
        error: viewLinks.error?.message ?? downloadLinks.error?.message,
      },
      { status: 500 },
    );
  }

  const { data: videoJob } = await supabase
    .from("video_jobs")
    .select("status, output_path, error_message")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let videoUrl: string | null = null;

  if (videoJob?.status === "ready" && videoJob.output_path) {
    const signedVideo = await supabase.storage
      .from("videos")
      .createSignedUrl(videoJob.output_path, 60 * 30, { download: true });
    videoUrl = signedVideo.data?.signedUrl ?? null;
  }

  return NextResponse.json({
    ok: true,
    photoCredit: photoCreditCents / 100,
    photos: validPhotos.map((photo, index) => ({
      photoId: photo.id,
      number: photo.position,
      viewUrl: viewLinks.data[index]?.signedUrl,
      downloadUrl: downloadLinks.data[index]?.signedUrl,
    })),
    video: videoJob
      ? {
          status: videoJob.status,
          url: videoUrl,
          error: videoJob.error_message,
        }
      : null,
  });
}
