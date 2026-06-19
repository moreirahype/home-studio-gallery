import { createVideoTask, KIE_VIDEO_MODEL } from "@/lib/kie";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const MOVEMENT_PROMPTS = [
  "Polished portrait video. Very slow cinematic camera push-in. The person remains nearly still with one natural blink. Preserve the exact face, expression, body, clothes, hands and background from the source image. No talking, smiling, head movement, morphing or new objects.",
  "Polished portrait video. Subtle horizontal camera slide creating gentle depth. The person remains completely still. Preserve the exact identity, facial expression, anatomy, clothes, hands and scene from the source image. No orbit, talking, gestures, morphing or new objects.",
  "Polished portrait video. Very slow cinematic camera pull-back. The person remains nearly still with only natural breathing. Preserve the exact face, expression, body, clothes, hands and environment from the source image. No talking, smiling, head movement, morphing or new objects.",
];

export async function startVideoJob({
  projectId,
  photoIds,
  orderId,
  appUrl,
}: {
  projectId: string;
  photoIds: string[];
  orderId?: string;
  appUrl: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data: photos, error } = await supabase
    .from("photos")
    .select("id, original_path, position")
    .eq("project_id", projectId)
    .in("id", photoIds)
    .eq("status", "ready")
    .order("position");

  if (error || !photos?.length) {
    throw new Error("Nenhuma foto pronta para o vídeo.");
  }

  const sources = photos;
  const signed = await supabase.storage
    .from("photo-originals")
    .createSignedUrls(
      sources.map((photo) => photo.original_path as string),
      60 * 60,
    );

  if (signed.error) {
    throw new Error(`Falha ao preparar fotos: ${signed.error.message}`);
  }

  const { data: job, error: jobError } = await supabase
    .from("video_jobs")
    .insert({
      project_id: projectId,
      order_id: orderId ?? null,
      model: KIE_VIDEO_MODEL,
      source_photo_ids: sources.map((photo) => photo.id),
      status: "generating",
    })
    .select("id")
    .single();

  if (jobError || !job) {
    throw new Error(
      `Falha ao criar o vídeo: ${jobError?.message ?? "registro ausente"}`,
    );
  }

  const callbackSecret = process.env.KIE_CALLBACK_SECRET;
  if (!callbackSecret) throw new Error("KIE_CALLBACK_SECRET não configurada.");
  const callbackUrl = new URL("/api/webhooks/kie", appUrl);
  callbackUrl.searchParams.set("secret", callbackSecret);

  const taskIds: string[] = [];

  for (let index = 0; index < sources.length; index += 1) {
    const imageUrl = signed.data[index]?.signedUrl;
    if (!imageUrl) throw new Error("URL temporária da foto não foi criada.");
    const taskId = await createVideoTask({
      prompt: MOVEMENT_PROMPTS[index % MOVEMENT_PROMPTS.length],
      imageUrl,
      callbackUrl: callbackUrl.toString(),
    });
    taskIds.push(taskId);
    await supabase.from("video_clips").insert({
      video_job_id: job.id,
      task_id: taskId,
      source_photo_id: sources[index].id,
      status: "generating",
    });
  }

  await supabase
    .from("video_jobs")
    .update({ task_ids: taskIds })
    .eq("id", job.id);

  return { videoJobId: job.id, taskIds };
}
