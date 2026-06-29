import { createImageTaskWithFallback } from "@/lib/kie";
import { insertManualPhotoReleases } from "@/lib/photo-access";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const PACK_PROMPTS = [
  {
    suffix: "A",
    label: "Autoridade",
    prompt: `Use the selected final image as the main reference.

Keep the person's face 100% identical to the selected image.

Create a new ultra realistic professional portrait based on this same person and same overall look, but with a stronger authority vibe.

Professional portrait. High-end look. Confident expression. Elegant posture. Slightly more serious facial expression. Premium corporate presence. Clean professional styling. Natural realistic lighting. Beautiful composition. Refined business portrait. Ultra realistic. High detail.

The result must look like a premium professional portrait that communicates confidence, authority and credibility.`,
  },
  {
    suffix: "B",
    label: "Simpatica",
    prompt: `Use the selected final image as the main reference.

Keep the person's face 100% identical to the selected image.

Create a new ultra realistic professional portrait based on this same person and same overall look, but with a more approachable and friendly vibe.

Professional portrait. Warm expression. Slight natural smile. Accessible and trustworthy presence. Professional but human. Natural posture. Clean styling. Beautiful soft lighting. Professional composition. Ultra realistic. High detail.

The result must look like a professional portrait that communicates friendliness, trust and approachability.`,
  },
  {
    suffix: "C",
    label: "Premium",
    prompt: `Use the selected final image as the main reference.

Keep the person's face 100% identical to the selected image.

Create a new ultra realistic professional portrait based on this same person and same overall look, but with a more premium and sophisticated vibe.

Luxury professional portrait. Elegant styling. High-end image. Premium presence. Confident expression. Sophisticated posture. Refined lighting. Beautiful polished composition. Professional and luxurious atmosphere. Ultra realistic. High detail.

The result must look like a premium portrait that communicates sophistication, status and strong personal branding.`,
  },
];

export async function startFirstImpressionPack({
  projectId,
  orderId,
  photoIds,
  appUrl,
}: {
  projectId: string;
  orderId: string;
  photoIds: string[];
  appUrl: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data: sourcePhotos, error } = await supabase
    .from("photos")
    .select("id, position, original_path")
    .eq("project_id", projectId)
    .in("id", [...new Set(photoIds)])
    .eq("status", "ready")
    .order("position");

  if (error) throw new Error(error.message);
  if (!sourcePhotos?.length) throw new Error("Nenhuma foto pronta para o pack.");

  const callbackSecret = process.env.KIE_CALLBACK_SECRET;
  if (!callbackSecret) throw new Error("KIE_CALLBACK_SECRET nao configurada.");
  const callbackUrl = new URL("/api/webhooks/kie", appUrl);
  callbackUrl.searchParams.set("secret", callbackSecret);

  const { data: currentMax } = await supabase
    .from("photos")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextPosition = Number(currentMax?.position ?? 0) + 1;
  const createdPhotoIds: string[] = [];
  const generationErrors: string[] = [];

  for (const sourcePhoto of sourcePhotos) {
    if (!sourcePhoto.original_path) continue;
    const signed = await supabase.storage
      .from("photo-originals")
      .createSignedUrl(sourcePhoto.original_path, 60 * 60);

    if (signed.error || !signed.data?.signedUrl) {
      throw new Error("Falha ao abrir foto final para o pack.");
    }

    for (const packPrompt of PACK_PROMPTS) {
      const marker = `Pack Primeira Impressao do pedido ${orderId}; source=${sourcePhoto.id}; variant=${packPrompt.suffix}`;
      const { data: existingPhoto } = await supabase
        .from("photos")
        .select("id, status, kie_task_id, position")
        .eq("project_id", projectId)
        .ilike("error_message", `${marker}%`)
        .maybeSingle();
      let photo = existingPhoto;

      if (!photo) {
        const { data: insertedPhoto, error: insertError } = await supabase
          .from("photos")
          .insert({
            project_id: projectId,
            position: nextPosition,
            generation_prompt: `${packPrompt.prompt}

Reference label: Foto ${String(sourcePhoto.position).padStart(2, "0")}${packPrompt.suffix} - ${packPrompt.label}.`,
            status: "queued",
            error_message: marker,
          })
          .select("id, status, kie_task_id, position")
          .single();

        if (insertError || !insertedPhoto) {
          generationErrors.push(
            insertError?.message ?? "Falha ao criar foto do pack.",
          );
          continue;
        }

        photo = insertedPhoto;
        nextPosition += 1;
      } else {
        nextPosition = Math.max(nextPosition, Number(photo.position) + 1);
      }

      createdPhotoIds.push(photo.id);
      if (photo.status === "ready" || photo.status === "generating") continue;

      try {
        const task = await createImageTaskWithFallback({
          prompt: packPrompt.prompt,
          sourceImageUrl: signed.data.signedUrl,
          contextFinal: packPrompt.label,
          callbackUrl: callbackUrl.toString(),
        });

        await supabase
          .from("photos")
          .update({
            kie_task_id: task.taskId,
            status: "generating",
            error_message: task.fallbackUsed
              ? `${marker} | Fallback ${task.model} iniciado: ${task.primaryError}`
              : marker,
          })
          .eq("id", photo.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Falha ao iniciar foto do pack.";
        generationErrors.push(message);
        await supabase
          .from("photos")
          .update({ status: "failed", error_message: `${marker} | ${message}` })
          .eq("id", photo.id);
      }
    }
  }

  await insertManualPhotoReleases({
    supabase,
    projectId,
    photoIds: createdPhotoIds,
  });

  if (generationErrors.length) {
    throw new Error(
      `O Pack ficou incompleto e será tentado novamente: ${generationErrors[0]}`,
    );
  }

  return { created: createdPhotoIds.length };
}
