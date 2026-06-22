import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import {
  GALLERY_RETENTION_DAYS,
  galleryExpiresAt,
} from "@/lib/gallery-expiration";
import { createWatermarkedPreview } from "@/lib/photo-processing";
import { getPricingBaseAmountCentsFromFirstExtraAmountCents } from "@/lib/pricing";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const MAX_MANUAL_PHOTOS = 20;

function compactPaths(paths: Array<string | null | undefined>) {
  return [...new Set(paths.filter((path): path is string => Boolean(path)))];
}

function parseMoney(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeMoney(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseInteger(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function normalizePhone(value: FormDataEntryValue | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function buildGalleryUrl(token: string, origin: string) {
  return new URL(`/g/${token}`, origin).toString();
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const appUrl = process.env.APP_URL ?? request.nextUrl.origin;
  const search = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const searchDigits = search.replace(/\D/g, "");

  let query = supabase
    .from("projects")
    .select(
      "id, gallery_token, customer_name, phone, context_final, paid_amount_cents, included_photos, generation_count, bi_attendant_name, created_at, expires_at",
    )
    .eq("niche_id", "manual")
    .order("created_at", { ascending: false })
    .limit(100);

  if (search) {
    query = searchDigits
      ? query.or(`customer_name.ilike.%${search}%,phone.ilike.%${searchDigits}%`)
      : query.ilike("customer_name", `%${search}%`);
  }

  let { data, error } = await query;

  if (
    error?.message.includes("expires_at") ||
    error?.message.includes("bi_attendant_name")
  ) {
    let fallbackQuery = supabase
      .from("projects")
      .select(
        "id, gallery_token, customer_name, phone, context_final, paid_amount_cents, included_photos, generation_count, created_at",
      )
      .eq("niche_id", "manual")
      .order("created_at", { ascending: false })
      .limit(100);

    if (search) {
      fallbackQuery = searchDigits
        ? fallbackQuery.or(
            `customer_name.ilike.%${search}%,phone.ilike.%${searchDigits}%`,
          )
        : fallbackQuery.ilike("customer_name", `%${search}%`);
    }

    const fallback = await fallbackQuery;
    data =
      fallback.data?.map((project) => ({
        ...project,
        bi_attendant_name: null,
        expires_at: null,
      })) ??
      null;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    galleries: (data ?? []).map((project) => {
      const expiresAt = galleryExpiresAt(project.created_at, project.expires_at);
      return {
        id: project.id,
        customerName: project.customer_name,
        phone: project.phone,
        contextFinal: project.context_final,
        paidAmount: Number(project.paid_amount_cents ?? 0) / 100,
        includedPhotos: project.included_photos,
        generationCount: project.generation_count,
        attendantName: project.bi_attendant_name,
        createdAt: project.created_at,
        expiresAt: expiresAt.toISOString(),
        expired: expiresAt.getTime() < Date.now(),
        galleryUrl: buildGalleryUrl(project.gallery_token, appUrl),
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const files = formData
    .getAll("photos")
    .filter((file): file is File => file instanceof File && file.size > 0)
    .slice(0, MAX_MANUAL_PHOTOS);

  if (!files.length) {
    return NextResponse.json(
      { ok: false, error: "Envie pelo menos uma foto." },
      { status: 400 },
    );
  }

  const customerName = String(formData.get("customerName") ?? "").trim();
  const phone = normalizePhone(formData.get("phone"));

  if (customerName.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Informe o nome do cliente." },
      { status: 400 },
    );
  }

  if (phone.length < 10) {
    return NextResponse.json(
      { ok: false, error: "Informe um telefone válido do cliente." },
      { status: 400 },
    );
  }

  const projectId = randomUUID();
  const galleryToken = randomUUID().replaceAll("-", "");
  const appUrl = process.env.APP_URL ?? request.nextUrl.origin;
  const paidAmountCents = Math.round(
    parseNonNegativeMoney(formData.get("paidAmount"), 7.9) * 100,
  );
  const includedPhotos = Math.min(
    files.length,
    Math.max(0, parseInteger(formData.get("includedPhotos"), 1)),
  );
  const firstExtraAmountCents = Math.round(
    parseMoney(formData.get("firstExtraAmount"), 9.9) * 100,
  );
  const pricingBaseAmountCents =
    getPricingBaseAmountCentsFromFirstExtraAmountCents({
      firstExtraAmountCents,
      includedPhotos,
    });
  const contextFinal =
    String(formData.get("contextFinal") ?? "").trim() || "Galeria manual";
  const attendantMode = String(formData.get("attendantMode") ?? "default");
  const attendantName =
    attendantMode === "sheila"
      ? "Sheila"
      : `Galeria ${(firstExtraAmountCents / 100).toFixed(2)}`;
  const supabase = getSupabaseAdmin();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + GALLERY_RETENTION_DAYS);

  const projectPayload = {
    id: projectId,
    gallery_token: galleryToken,
    customer_name: customerName,
    phone,
    source_image_url: "manual-upload",
    context_final: contextFinal,
    niche_id: "manual",
    included_photos: includedPhotos,
    paid_amount_cents: paidAmountCents,
    pricing_base_amount_cents: pricingBaseAmountCents,
    generation_count: files.length,
    bi_attendant_name: attendantName,
    expires_at: expiresAt.toISOString(),
    status: "ready",
  };
  let compatibleProjectPayload = projectPayload;
  let { error: projectError } = await supabase
    .from("projects")
    .insert(compatibleProjectPayload);

  if (projectError?.message.includes("pricing_base_amount_cents")) {
    const { pricing_base_amount_cents: ignored, ...legacyPricingPayload } =
      compatibleProjectPayload;
    void ignored;
    compatibleProjectPayload = legacyPricingPayload as typeof projectPayload;
    const fallbackInsert = await supabase
      .from("projects")
      .insert(compatibleProjectPayload);
    projectError = fallbackInsert.error;
  }

  if (projectError?.message.includes("bi_attendant_name")) {
    const { bi_attendant_name: ignored, ...legacyAttributionPayload } =
      compatibleProjectPayload;
    void ignored;
    compatibleProjectPayload = legacyAttributionPayload as typeof projectPayload;
    const fallbackInsert = await supabase
      .from("projects")
      .insert(compatibleProjectPayload);
    projectError = fallbackInsert.error;
  }

  if (projectError?.message.includes("expires_at")) {
    const { expires_at: ignored, ...legacyExpirationPayload } =
      compatibleProjectPayload;
    void ignored;
    compatibleProjectPayload = legacyExpirationPayload as typeof projectPayload;
    const fallbackInsert = await supabase
      .from("projects")
      .insert(compatibleProjectPayload);
    projectError = fallbackInsert.error;
  }

  if (
    projectError?.code === "42703" ||
    projectError?.message.includes("generation_count")
  ) {
    const { generation_count: ignored, ...legacyGenerationPayload } =
      compatibleProjectPayload;
    void ignored;
    const fallbackInsert = await supabase
      .from("projects")
      .insert(legacyGenerationPayload);
    projectError = fallbackInsert.error;
  }

  if (projectError) {
    return NextResponse.json(
      { ok: false, error: `Falha ao criar galeria: ${projectError.message}` },
      { status: 500 },
    );
  }

  try {
    const rows = [];

    for (const [index, file] of files.entries()) {
      const position = index + 1;
      const input = Buffer.from(await file.arrayBuffer());
      const original = await sharp(input)
        .rotate()
        .jpeg({ quality: 95, mozjpeg: true })
        .toBuffer();
      const preview = await createWatermarkedPreview(original);
      const originalPath = `${projectId}/${String(position).padStart(2, "0")}.jpg`;
      const previewPath = `${projectId}/${String(position).padStart(2, "0")}.jpg`;

      const [originalUpload, previewUpload] = await Promise.all([
        supabase.storage.from("photo-originals").upload(originalPath, original, {
          contentType: "image/jpeg",
          upsert: true,
        }),
        supabase.storage.from("photo-previews").upload(previewPath, preview, {
          contentType: "image/jpeg",
          upsert: true,
        }),
      ]);

      if (originalUpload.error || previewUpload.error) {
        throw new Error(
          originalUpload.error?.message ??
            previewUpload.error?.message ??
            "Falha ao subir imagem.",
        );
      }

      rows.push({
        project_id: projectId,
        position,
        generation_prompt: contextFinal,
        original_path: originalPath,
        preview_path: previewPath,
        status: "ready",
      });
    }

    const { error: photosError } = await supabase.from("photos").insert(rows);
    if (photosError) throw new Error(photosError.message);
  } catch (error) {
    await supabase.from("projects").delete().eq("id", projectId);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar as fotos.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    projectId,
    galleryUrl: buildGalleryUrl(galleryToken, appUrl),
    photos: files.length,
  });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    confirmation?: string;
  };

  if (body.confirmation?.trim().toLowerCase() !== "excluir") {
    return NextResponse.json(
      { ok: false, error: 'Digite "excluir" para confirmar.' },
      { status: 400 },
    );
  }

  if (!body.projectId) {
    return NextResponse.json(
      { ok: false, error: "Galeria inválida." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: project } = await supabase
    .from("projects")
    .select("id, niche_id, source_image_path")
    .eq("id", body.projectId)
    .maybeSingle();

  if (!project || project.niche_id !== "manual") {
    return NextResponse.json(
      { ok: false, error: "Galeria manual não encontrada." },
      { status: 404 },
    );
  }

  const [{ data: photos }, { data: videoJobs }] = await Promise.all([
    supabase
      .from("photos")
      .select("original_path, preview_path")
      .eq("project_id", project.id),
    supabase
      .from("video_jobs")
      .select("id, output_path")
      .eq("project_id", project.id),
  ]);
  const videoJobIds = (videoJobs ?? []).map((job) => job.id);
  const { data: videoClips } = videoJobIds.length
    ? await supabase
        .from("video_clips")
        .select("path")
        .in("video_job_id", videoJobIds)
    : { data: [] };

  await Promise.all([
    supabase.storage
      .from("photo-originals")
      .remove(compactPaths((photos ?? []).map((photo) => photo.original_path))),
    supabase.storage
      .from("photo-previews")
      .remove(compactPaths((photos ?? []).map((photo) => photo.preview_path))),
    supabase.storage
      .from("videos")
      .remove(compactPaths((videoJobs ?? []).map((job) => job.output_path))),
    supabase.storage
      .from("video-clips")
      .remove(compactPaths((videoClips ?? []).map((clip) => clip.path))),
    supabase.storage
      .from("source-images")
      .remove(compactPaths([project.source_image_path])),
  ]);

  const { error: ordersError } = await supabase
    .from("orders")
    .delete()
    .eq("project_id", project.id);
  if (ordersError) {
    return NextResponse.json(
      { ok: false, error: ordersError.message },
      { status: 500 },
    );
  }

  const { error: deleteError } = await supabase
    .from("projects")
    .delete()
    .eq("id", project.id);

  if (deleteError) {
    return NextResponse.json(
      { ok: false, error: deleteError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
