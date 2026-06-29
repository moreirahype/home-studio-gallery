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

  let job = orderId
    ? (
        await supabase
          .from("video_jobs")
          .select("id, status, output_path, task_ids")
          .eq("order_id", orderId)
          .maybeSingle()
      ).data
    : null;

  if (!job) {
    const { data: createdJob, error: jobError } = await supabase
      .from("video_jobs")
      .insert({
        project_id: projectId,
        order_id: orderId ?? null,
        model: KIE_VIDEO_MODEL,
        source_photo_ids: sources.map((photo) => photo.id),
        status: "generating",
      })
      .select("id, status, output_path, task_ids")
      .single();

    if (jobError || !createdJob) {
      throw new Error(
        `Falha ao criar o vídeo: ${jobError?.message ?? "registro ausente"}`,
      );
    }
    job = createdJob;
  }

  const callbackSecret = process.env.KIE_CALLBACK_SECRET;
  if (!callbackSecret) throw new Error("KIE_CALLBACK_SECRET não configurada.");
  const callbackUrl = new URL("/api/webhooks/kie", appUrl);
  callbackUrl.searchParams.set("secret", callbackSecret);

  const { data: existingClips } = await supabase
    .from("video_clips")
    .select("id, task_id, source_photo_id, status")
    .eq("video_job_id", job.id);
  const existingClipBySource = new Map(
    (existingClips ?? []).map((clip) => [clip.source_photo_id as string, clip]),
  );
  const taskIds: string[] = (existingClips ?? [])
    .map((clip) => clip.task_id as string | null)
    .filter((taskId): taskId is string => Boolean(taskId));
  const generationErrors: string[] = [];

  if (job.status === "ready" && job.output_path) {
    return { videoJobId: job.id, taskIds: job.task_ids ?? taskIds };
  }

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const existingClip = existingClipBySource.get(source.id);
    if (
      existingClip?.status === "ready" ||
      (existingClip?.status === "generating" && existingClip.task_id)
    ) {
      continue;
    }

    const imageUrl = signed.data[index]?.signedUrl;
    if (!imageUrl) {
      generationErrors.push("URL temporária da foto não foi criada.");
      continue;
    }

    try {
      const taskId = await createVideoTask({
        prompt: MOVEMENT_PROMPTS[index % MOVEMENT_PROMPTS.length],
        imageUrl,
        callbackUrl: callbackUrl.toString(),
      });
      taskIds.push(taskId);
      const clipWrite = existingClip
        ? await supabase
            .from("video_clips")
            .update({ task_id: taskId, status: "generating", error_message: null })
            .eq("id", existingClip.id)
        : await supabase.from("video_clips").insert({
            video_job_id: job.id,
            task_id: taskId,
            source_photo_id: source.id,
            status: "generating",
          });
      if (clipWrite.error) throw new Error(clipWrite.error.message);
    } catch (error) {
      generationErrors.push(
        error instanceof Error ? error.message : "Falha ao iniciar vídeo.",
      );
    }
  }

  const allExpectedClipsReady = sources.every(
    (source) => existingClipBySource.get(source.id)?.status === "ready",
  );
  await supabase
    .from("video_jobs")
    .update({
      task_ids: [...new Set(taskIds)],
      status: generationErrors.length
        ? "failed"
        : allExpectedClipsReady
          ? "ready"
          : "generating",
      error_message: generationErrors[0] ?? null,
    })
    .eq("id", job.id);

  if (generationErrors.length) {
    throw new Error(
      `A geração de vídeo ficou incompleta e será tentada novamente: ${generationErrors[0]}`,
    );
  }

  return { videoJobId: job.id, taskIds };
}
