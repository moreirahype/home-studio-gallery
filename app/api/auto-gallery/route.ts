import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { galleryExpiresAt } from "@/lib/gallery-expiration";
import { startProjectGeneration } from "@/lib/generation";
import {
  formatBrazilianMobile,
  normalizeBrazilianMobile,
} from "@/lib/phone";
import {
  buildGenerationPrompts,
  refineGenerationContext,
} from "@/lib/prompt-builder";
import { getPricingBaseAmountCentsFromFirstExtraAmountCents } from "@/lib/pricing";
import { safeCompare } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function parseMoney(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parsePositiveMoney(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCount(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function parseNonNegativeCount(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
}

function getAdminPassword() {
  return process.env.GALLERY_ADMIN_PASSWORD ?? process.env.MANUAL_GALLERY_PASSWORD;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");

  if (!safeCompare(password, getAdminPassword())) {
    return NextResponse.json(
      { ok: false, error: "Senha inválida." },
      { status: 403 },
    );
  }

  const reference = formData.get("reference");
  if (!(reference instanceof File) || !reference.size) {
    return NextResponse.json(
      { ok: false, error: "Envie uma foto de referência." },
      { status: 400 },
    );
  }

  if (reference.size > 15 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "A foto deve ter no máximo 15 MB." },
      { status: 400 },
    );
  }

  const customerName = String(formData.get("customerName") ?? "").trim();
  const phone = normalizeBrazilianMobile(String(formData.get("phone") ?? ""));
  const contextFinal = String(formData.get("contextFinal") ?? "").trim();

  if (customerName.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Informe o nome do cliente." },
      { status: 400 },
    );
  }

  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "Informe um telefone válido do cliente." },
      { status: 400 },
    );
  }

  if (contextFinal.length < 3) {
    return NextResponse.json(
      { ok: false, error: "Descreva o ensaio." },
      { status: 400 },
    );
  }

  const generationCount = Math.min(20, parseCount(formData.get("generationCount"), 15));
  const includedPhotos = Math.min(
    generationCount,
    Math.max(0, parseNonNegativeCount(formData.get("includedPhotos"), 1)),
  );
  const paidAmountCents = Math.round(parseMoney(formData.get("paidAmount"), 7.9) * 100);
  const firstExtraAmountCents = Math.round(
    parsePositiveMoney(formData.get("firstExtraAmount"), 7.9) * 100,
  );
  const pricingBaseAmountCents =
    getPricingBaseAmountCentsFromFirstExtraAmountCents({
      firstExtraAmountCents,
      includedPhotos,
    });
  const attendantMode = String(formData.get("attendantMode") ?? "default");
  const attendantPrefix =
    attendantMode === "sheila" ? "Galeria Sheila Turbo" : "Galeria Manual Turbo";
  const attendantName = `${attendantPrefix} ${(firstExtraAmountCents / 100).toFixed(2)}`;
  const projectId = randomUUID();
  const galleryToken = randomUUID().replaceAll("-", "");
  const referencePath = `auto/${projectId}/reference.jpg`;
  const appUrl = process.env.APP_URL ?? request.nextUrl.origin;
  const supabase = getSupabaseAdmin();
  const expiresAt = galleryExpiresAt(new Date().toISOString());
  const referenceBuffer = Buffer.from(await reference.arrayBuffer());

  const upload = await supabase.storage
    .from("source-images")
    .upload(referencePath, referenceBuffer, {
      contentType: reference.type || "image/jpeg",
      upsert: false,
    });

  if (upload.error) {
    return NextResponse.json(
      { ok: false, error: `Falha ao enviar a foto: ${upload.error.message}` },
      { status: 500 },
    );
  }

  const signedReference = await supabase.storage
    .from("source-images")
    .createSignedUrl(referencePath, 60 * 60 * 48);

  if (signedReference.error || !signedReference.data?.signedUrl) {
    await supabase.storage.from("source-images").remove([referencePath]);
    return NextResponse.json(
      { ok: false, error: "Falha ao preparar a foto de referência." },
      { status: 500 },
    );
  }

  const refinedContextFinal = refineGenerationContext(contextFinal);
  const projectPayload = {
    id: projectId,
    gallery_token: galleryToken,
    customer_name: customerName,
    phone,
    source_image_url: signedReference.data.signedUrl,
    source_image_path: referencePath,
    context_final: refinedContextFinal,
    niche_id: "auto_manual",
    included_photos: includedPhotos,
    paid_amount_cents: paidAmountCents,
    pricing_base_amount_cents: pricingBaseAmountCents,
    generation_count: generationCount,
    bi_attendant_name: attendantName,
    expires_at: expiresAt.toISOString(),
    status: "queued",
  };

  let compatibleProjectPayload = projectPayload;
  let { error: projectError } = await supabase
    .from("projects")
    .insert(compatibleProjectPayload);

  if (projectError?.message.includes("pricing_base_amount_cents")) {
    const { pricing_base_amount_cents: ignored, ...legacyPayload } =
      compatibleProjectPayload;
    void ignored;
    compatibleProjectPayload = legacyPayload as typeof projectPayload;
    const fallback = await supabase.from("projects").insert(compatibleProjectPayload);
    projectError = fallback.error;
  }

  if (projectError?.message.includes("bi_attendant_name")) {
    const { bi_attendant_name: ignored, ...legacyPayload } =
      compatibleProjectPayload;
    void ignored;
    compatibleProjectPayload = legacyPayload as typeof projectPayload;
    const fallback = await supabase.from("projects").insert(compatibleProjectPayload);
    projectError = fallback.error;
  }

  if (projectError?.message.includes("expires_at")) {
    const { expires_at: ignored, ...legacyPayload } = compatibleProjectPayload;
    void ignored;
    compatibleProjectPayload = legacyPayload as typeof projectPayload;
    const fallback = await supabase.from("projects").insert(compatibleProjectPayload);
    projectError = fallback.error;
  }

  if (
    projectError?.code === "42703" ||
    projectError?.message.includes("generation_count")
  ) {
    const { generation_count: ignored, ...legacyPayload } =
      compatibleProjectPayload;
    void ignored;
    const fallback = await supabase.from("projects").insert(legacyPayload);
    projectError = fallback.error;
  }

  if (projectError) {
    await supabase.storage.from("source-images").remove([referencePath]);
    return NextResponse.json(
      { ok: false, error: `Falha ao criar galeria: ${projectError.message}` },
      { status: 500 },
    );
  }

  const prompts = buildGenerationPrompts(refinedContextFinal).slice(
    0,
    generationCount,
  );
  const { error: photosError } = await supabase.from("photos").insert(
    prompts.map(({ position, prompt }) => ({
      project_id: projectId,
      position,
      generation_prompt: prompt,
      status: "queued",
    })),
  );

  if (photosError) {
    await supabase.from("projects").delete().eq("id", projectId);
    await supabase.storage.from("source-images").remove([referencePath]);
    return NextResponse.json(
      { ok: false, error: `Falha ao preparar as fotos: ${photosError.message}` },
      { status: 500 },
    );
  }

  try {
    const generation = await startProjectGeneration({ projectId, appUrl });
    const galleryUrl = new URL(`/g/${galleryToken}`, appUrl).toString();

    return NextResponse.json({
      ok: true,
      projectId,
      galleryUrl,
      customerName,
      phone: formatBrazilianMobile(phone),
      generationStarted: Boolean(generation.started.length),
      generationTasks: generation.started.length,
      generationFailed: generation.failed,
    });
  } catch (error) {
    await supabase
      .from("projects")
      .update({ status: "failed" })
      .eq("id", projectId);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Falha ao iniciar a geração.",
      },
      { status: 502 },
    );
  }
}
