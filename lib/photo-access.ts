import { getSupabaseAdmin } from "@/lib/supabase-admin";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

type ClaimRow = {
  photo_id: string;
  release_kind?: string | null;
};

type PhotoPosition = {
  id: string;
  position: number;
};

function isMissingReleaseKind(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "42703" ||
        error.message?.includes("release_kind") ||
        error.message?.includes("schema cache")),
  );
}

async function readPhotoClaims({
  supabase,
  projectId,
}: {
  supabase: SupabaseAdmin;
  projectId: string;
}) {
  let claims: {
    data: ClaimRow[] | null;
    error: { code?: string; message: string } | null;
  } = await supabase
    .from("project_included_photos")
    .select("photo_id, release_kind")
    .eq("project_id", projectId);

  if (isMissingReleaseKind(claims.error)) {
    claims = await supabase
      .from("project_included_photos")
      .select("photo_id")
      .eq("project_id", projectId);
  }

  return claims as {
    data: ClaimRow[] | null;
    error: { code?: string; message: string } | null;
  };
}

async function sortPhotoIdsByPosition({
  supabase,
  projectId,
  photoIds,
}: {
  supabase: SupabaseAdmin;
  projectId: string;
  photoIds: string[];
}) {
  if (!photoIds.length) return [];

  const { data, error } = await supabase
    .from("photos")
    .select("id, position")
    .eq("project_id", projectId)
    .in("id", photoIds)
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as PhotoPosition[]).map((photo) => photo.id);
}

export async function getClaimedPhotoAccess({
  supabase,
  projectId,
  includedPhotos,
}: {
  supabase: SupabaseAdmin;
  projectId: string;
  includedPhotos: number;
}) {
  const claims = await readPhotoClaims({ supabase, projectId });

  if (claims.error) {
    if (["42P01", "PGRST205"].includes(claims.error.code ?? "")) {
      return {
        includedPhotoIds: new Set<string>(),
        manualPhotoIds: new Set<string>(),
        accessiblePhotoIds: new Set<string>(),
      };
    }

    throw new Error(claims.error.message);
  }

  const safeIncluded = Math.max(0, Math.round(includedPhotos));
  const manualClaimIds = new Set<string>();
  const includedClaimIds = new Set<string>();

  for (const claim of claims.data ?? []) {
    if (claim.release_kind === "manual") {
      manualClaimIds.add(claim.photo_id);
    } else {
      includedClaimIds.add(claim.photo_id);
    }
  }

  const cappedIncludedIds = new Set(
    (
      await sortPhotoIdsByPosition({
        supabase,
        projectId,
        photoIds: [...includedClaimIds],
      })
    ).slice(0, safeIncluded),
  );

  return {
    includedPhotoIds: cappedIncludedIds,
    manualPhotoIds: manualClaimIds,
    accessiblePhotoIds: new Set([...cappedIncludedIds, ...manualClaimIds]),
  };
}

export async function insertIncludedPhotoClaims({
  supabase,
  projectId,
  photoIds,
}: {
  supabase: SupabaseAdmin;
  projectId: string;
  photoIds: string[];
}) {
  const uniquePhotoIds = [...new Set(photoIds)];
  if (!uniquePhotoIds.length) return;

  const rows = uniquePhotoIds.map((photoId) => ({
    project_id: projectId,
    photo_id: photoId,
    release_kind: "included",
  }));
  let result = await supabase
    .from("project_included_photos")
    .upsert(rows, { onConflict: "project_id,photo_id" });

  if (isMissingReleaseKind(result.error)) {
    result = await supabase.from("project_included_photos").upsert(
      rows.map(({ release_kind: ignored, ...row }) => {
        void ignored;
        return row;
      }),
      { onConflict: "project_id,photo_id" },
    );
  }

  if (result.error && result.error.code !== "23505") {
    throw new Error(result.error.message);
  }
}

export async function insertManualPhotoReleases({
  supabase,
  projectId,
  photoIds,
}: {
  supabase: SupabaseAdmin;
  projectId: string;
  photoIds: string[];
}) {
  const uniquePhotoIds = [...new Set(photoIds)];
  if (!uniquePhotoIds.length) return;

  const rows = uniquePhotoIds.map((photoId) => ({
    project_id: projectId,
    photo_id: photoId,
    release_kind: "manual",
  }));
  let result = await supabase
    .from("project_included_photos")
    .upsert(rows, { onConflict: "project_id,photo_id" });

  if (isMissingReleaseKind(result.error)) {
    result = await supabase.from("project_included_photos").upsert(
      rows.map(({ release_kind: ignored, ...row }) => {
        void ignored;
        return row;
      }),
      { onConflict: "project_id,photo_id" },
    );
  }

  if (result.error && result.error.code !== "23505") {
    throw new Error(result.error.message);
  }
}
