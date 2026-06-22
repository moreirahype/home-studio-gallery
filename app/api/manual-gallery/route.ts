import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { createWatermarkedPreview } from "@/lib/photo-processing";
import { getPricingBaseAmountCentsFromFirstExtraAmountCents } from "@/lib/pricing";
import { safeCompare } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const MAX_MANUAL_PHOTOS = 20;

function parseMoney(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseInteger(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function manualPassword() {
  return (
    process.env.MANUAL_GALLERY_PASSWORD ??
    process.env.GALLERY_MANUAL_RELEASE_PASSWORD ??
    process.env.MANUAL_RELEASE_PASSWORD
  );
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = formData.get("password");

  if (!safeCompare(typeof password === "string" ? password : null, manualPassword())) {
    return NextResponse.json(
      { ok: false, error: "Senha interna inválida." },
      { status: 403 },
    );
  }

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

  const projectId = randomUUID();
  const galleryToken = randomUUID().replaceAll("-", "");
  const appUrl = process.env.APP_URL ?? request.nextUrl.origin;
  const paidAmountCents = Math.round(parseMoney(formData.get("paidAmount"), 7.9) * 100);
  const includedPhotos = Math.min(
    files.length,
    Math.max(1, parseInteger(formData.get("includedPhotos"), 1)),
  );
  const firstExtraAmountCents = Math.round(
    parseMoney(formData.get("firstExtraAmount"), 9.9) * 100,
  );
  const pricingBaseAmountCents = getPricingBaseAmountCentsFromFirstExtraAmountCents({
    firstExtraAmountCents,
    includedPhotos,
  });
  const contextFinal =
    String(formData.get("contextFinal") ?? "").trim() || "Galeria manual";
  const customerName = String(formData.get("customerName") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").replace(/\D/g, "") || null;
  const supabase = getSupabaseAdmin();

  const { error: projectError } = await supabase.from("projects").insert({
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
    bi_attendant_name: `Galeria ${(firstExtraAmountCents / 100).toFixed(2)}`,
    status: "ready",
  });

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
    galleryUrl: new URL(`/g/${galleryToken}`, appUrl).toString(),
    photos: files.length,
  });
}
