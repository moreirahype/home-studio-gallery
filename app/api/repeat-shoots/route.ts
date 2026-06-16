import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyExpressOfferToken } from "@/lib/offers";

const fieldsSchema = z.object({
  sourceToken: z.string().optional(),
  theme: z.string().min(2),
  occasion: z.string().max(240).optional(),
  styleNotes: z.string().max(1000).optional(),
  offer: z.enum(["standard", "express", "vip"]).default("standard"),
  offerToken: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = fieldsSchema.safeParse({
    sourceToken: formData.get("sourceToken")?.toString(),
    theme: formData.get("theme")?.toString(),
    occasion: formData.get("occasion")?.toString(),
    styleNotes: formData.get("styleNotes")?.toString(),
    offer: formData.get("offer")?.toString(),
    offerToken: formData.get("offerToken")?.toString(),
  });
  const reference = formData.get("reference");

  if (!parsed.success || !(reference instanceof File) || !reference.size) {
    return NextResponse.json(
      { ok: false, error: "Preencha o tema e envie uma foto válida." },
      { status: 400 },
    );
  }

  if (reference.size > 15 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "A foto deve ter no máximo 15 MB." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const isExpress = parsed.data.offer === "express";
  const isVip = parsed.data.offer === "vip";
  if (
    isExpress &&
    !verifyExpressOfferToken(
      parsed.data.offerToken,
      parsed.data.sourceToken,
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Esta oferta especial expirou." },
      { status: 403 },
    );
  }
  const photoCount = isVip ? 15 : isExpress ? 5 : 15;
  const includedPhotos = isVip ? 3 : 1;
  const paidAmountCents = isVip ? 1490 : isExpress ? 490 : 790;
  let sourceProjectId: string | null = null;

  if (parsed.data.sourceToken) {
    const { data: sourceProject } = await supabase
      .from("projects")
      .select("id")
      .eq("gallery_token", parsed.data.sourceToken)
      .maybeSingle();
    sourceProjectId = sourceProject?.id ?? null;
  }

  const requestId = randomUUID();
  const extension = reference.name.split(".").pop()?.toLowerCase() || "jpg";
  const referencePath = `repeat/${requestId}/reference.${extension}`;
  const upload = await supabase.storage
    .from("source-images")
    .upload(referencePath, Buffer.from(await reference.arrayBuffer()), {
      contentType: reference.type || "image/jpeg",
      upsert: false,
    });

  if (upload.error) {
    return NextResponse.json(
      { ok: false, error: `Falha ao enviar a foto: ${upload.error.message}` },
      { status: 500 },
    );
  }

  const { error } = await supabase.from("repeat_shoots").insert({
    id: requestId,
    source_project_id: sourceProjectId,
    reference_image_path: referencePath,
    theme: parsed.data.theme,
    occasion: parsed.data.occasion || null,
    style_notes: parsed.data.styleNotes || null,
    photo_count: photoCount,
    included_photos: includedPhotos,
    paid_amount_cents: paidAmountCents,
    status: "pending_payment",
  });

  if (error) {
    await supabase.storage.from("source-images").remove([referencePath]);
    return NextResponse.json(
      { ok: false, error: `Falha ao preparar o ensaio: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    repeatShootId: requestId,
    amount: paidAmountCents / 100,
    photoCount,
    includedPhotos,
    status: "pending_payment",
  });
}
