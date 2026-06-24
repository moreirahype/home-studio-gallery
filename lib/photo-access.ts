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

type PaidPhotoCreditItem = {
  amount_cents: number | string | null;
  metadata?: unknown;
};

function metadataPhotoIds(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return [];
  const photoIds = (metadata as { photoIds?: unknown }).photoIds;
  return Array.isArray(photoIds)
    ? photoIds.filter((photoId): photoId is string => typeof photoId === "string")
    : [];
}

function isMissingReleaseKind(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "42703" ||
        error.message?.includes("release_kind") ||
        error.message?.includes("schema cache")),
  );
}

function isBlockedReleaseKindUnsupported(
  error: { code?: string; message?: string } | null,
) {
  return Boolean(
    error &&
      (error.code === "23514" ||
        error.message?.includes("release_kind") ||
        error.message?.includes("project_included_photos_release_kind_check")),
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
        blockedPhotoIds: new Set<string>(),
        accessiblePhotoIds: new Set<string>(),
      };
    }

    throw new Error(claims.error.message);
  }

  const safeIncluded = Math.max(0, Math.round(includedPhotos));
  const manualClaimIds = new Set<string>();
  const includedClaimIds = new Set<string>();
  const blockedClaimIds = new Set<string>();

  for (const claim of claims.data ?? []) {
    if (claim.release_kind === "blocked") {
      blockedClaimIds.add(claim.photo_id);
    } else if (claim.release_kind === "manual") {
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

  const accessiblePhotoIds = new Set([...cappedIncludedIds, ...manualClaimIds]);
  for (const photoId of blockedClaimIds) {
    accessiblePhotoIds.delete(photoId);
  }

  return {
    includedPhotoIds: cappedIncludedIds,
    manualPhotoIds: manualClaimIds,
    blockedPhotoIds: blockedClaimIds,
    accessiblePhotoIds,
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

  if (
    isMissingReleaseKind(result.error) ||
    isBlockedReleaseKindUnsupported(result.error)
  ) {
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

export async function deleteClaimedPhotoAccess({
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
    release_kind: "blocked",
  }));
  let result = await supabase
    .from("project_included_photos")
    .upsert(rows, { onConflict: "project_id,photo_id" });

  if (isMissingReleaseKind(result.error)) {
    result = await supabase
      .from("project_included_photos")
      .delete()
      .eq("project_id", projectId)
      .in("photo_id", uniquePhotoIds);
  }

  if (result.error) {
    if (["42P01", "PGRST205"].includes(result.error.code ?? "")) return;
    throw new Error(result.error.message);
  }

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id")
    .eq("project_id", projectId);

  if (ordersError) throw new Error(ordersError.message);

  const orderIds = (orders ?? []).map((order) => order.id as string);
  if (!orderIds.length) return;

  const { error: paidDeleteError } = await supabase
    .from("order_photos")
    .delete()
    .in("order_id", orderIds)
    .in("photo_id", uniquePhotoIds);

  if (paidDeleteError) {
    throw new Error(paidDeleteError.message);
  }
}

export function getAvailablePaidPhotoCreditCents({
  items,
  initialCreditCents,
  blockedPhotoIds,
}: {
  items: PaidPhotoCreditItem[];
  initialCreditCents: number;
  blockedPhotoIds: Set<string>;
}) {
  return items.reduce((total, item) => {
    const amount = Number(item.amount_cents || 0);
    if (!amount) return total;

    const photoIds = metadataPhotoIds(item.metadata);
    if (!photoIds.length) return total + amount;

    const availableCount = photoIds.filter(
      (photoId) => !blockedPhotoIds.has(photoId),
    ).length;

    if (!availableCount) return total;

    return total + Math.round(amount * (availableCount / photoIds.length));
  }, initialCreditCents);
}
