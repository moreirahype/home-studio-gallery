import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isGalleryExpired } from "@/lib/gallery-expiration";
import { getClaimedPhotoAccess } from "@/lib/photo-access";
import { getAdditionalPhotoAmountCents } from "@/lib/pricing";
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
      { ok: false, error: "Galeria inválida." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  let { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, included_photos, paid_amount_cents, pricing_base_amount_cents, created_at, expires_at",
    )
    .eq("gallery_token", parsed.data.token)
    .maybeSingle();

  if (projectError && projectError.code === "42703") {
    const fallback = await supabase
      .from("projects")
      .select("id, included_photos, paid_amount_cents, created_at")
      .eq("gallery_token", parsed.data.token)
      .maybeSingle();
    project = fallback.data
      ? { ...fallback.data, pricing_base_amount_cents: null, expires_at: null }
      : null;
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

  let claimedAccess: Awaited<ReturnType<typeof getClaimedPhotoAccess>>;
  try {
    claimedAccess = await getClaimedPhotoAccess({
      supabase,
      projectId: project.id,
      includedPhotos: project.included_photos,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Nao foi possivel carregar as fotos liberadas.",
      },
      { status: 500 },
    );
  }

  const unlockedPhotoIds = new Set(claimedAccess.accessiblePhotoIds);

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

  const paidPhotoCreditCents = (paidPhotoItems ?? []).reduce(
    (total, item) => total + Number(item.amount_cents || 0),
    project.paid_amount_cents,
  );
  const unlockedPhotoCreditCents =
    project.paid_amount_cents +
    getAdditionalPhotoAmountCents({
      selectedCount: unlockedPhotoIds.size,
      includedPhotos: project.included_photos,
      paidAmountCents: project.paid_amount_cents,
      pricingBaseAmountCents: project.pricing_base_amount_cents,
    });
  const photoCreditCents = Math.max(
    paidPhotoCreditCents,
    unlockedPhotoCreditCents,
  );

  const { data: photos, error: photosError } = unlockedPhotoIds.size
    ? await supabase
        .from("photos")
        .select("id, position, original_path")
        .eq("project_id", project.id)
        .eq("status", "ready")
        .in("id", [...unlockedPhotoIds])
        .order("position", { ascending: true })
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
    .select("id, status, output_path, error_message")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let videoUrl: string | null = null;
  let videoClips: { number: number; url: string }[] = [];
  let videoStatus = videoJob?.status ?? null;
  let videoError = videoJob?.error_message ?? null;

  if (videoJob?.status === "ready" && videoJob.output_path) {
    const signedVideo = await supabase.storage
      .from("videos")
      .createSignedUrl(videoJob.output_path, 60 * 30, { download: true });
    videoUrl = signedVideo.data?.signedUrl ?? null;
  }

  if (!videoUrl && videoJob?.id) {
    const { data: readyClips } = await supabase
      .from("video_clips")
      .select("path")
      .eq("video_job_id", videoJob.id)
      .eq("status", "ready")
      .not("path", "is", null)
      .order("created_at");

    const clipPaths = (readyClips ?? [])
      .map((clip) => clip.path as string | null)
      .filter((path): path is string => Boolean(path));

    if (clipPaths.length) {
      const signedClips = await supabase.storage
        .from("video-clips")
        .createSignedUrls(clipPaths, 60 * 30, { download: true });

      videoClips = (signedClips.data ?? []).flatMap((clip, index) =>
        clip.signedUrl
          ? [
              {
                number: index + 1,
                url: clip.signedUrl,
              },
            ]
          : [],
      );

      if (videoClips.length) {
        videoStatus = "ready";
        videoError = null;
      }
    }
  }

  const { data: repeatShoots } = await supabase
    .from("repeat_shoots")
    .select("project_id, theme, status, created_at")
    .eq("source_project_id", project.id)
    .not("project_id", "is", null)
    .order("created_at", { ascending: false });
  const repeatProjectIds = (repeatShoots ?? [])
    .map((shoot) => shoot.project_id as string | null)
    .filter((projectId): projectId is string => Boolean(projectId));
  const { data: repeatProjects } = repeatProjectIds.length
    ? await supabase
        .from("projects")
        .select("id, gallery_token, status, created_at, expires_at")
        .in("id", repeatProjectIds)
    : { data: [] };
  const repeatProjectMap = new Map(
    (repeatProjects ?? []).map((repeatProject) => [
      repeatProject.id,
      repeatProject,
    ]),
  );
  const relatedGalleries = (repeatShoots ?? []).flatMap((shoot, index) => {
    const repeatProject = repeatProjectMap.get(shoot.project_id as string);
    if (
      !["generating", "ready"].includes(shoot.status ?? "") ||
      !repeatProject?.gallery_token ||
      isGalleryExpired(repeatProject.created_at, repeatProject.expires_at)
    ) {
      return [];
    }

    return [
      {
        token: repeatProject.gallery_token,
        title: shoot.theme || `Novo ensaio ${index + 1}`,
        status: repeatProject.status || shoot.status,
        url: `/g/${repeatProject.gallery_token}`,
      },
    ];
  });

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
          status: videoStatus,
          url: videoUrl,
          clips: videoClips,
          error: videoError,
        }
      : null,
    relatedGalleries,
  });
}
