import { createImageTask } from "@/lib/kie";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function startProjectGeneration({
  projectId,
  limit,
  positions,
  appUrl,
}: {
  projectId: string;
  limit?: number;
  positions?: number[];
  appUrl: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, source_image_url, source_image_path, context_final")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    throw new Error("Projeto não encontrado.");
  }

  let sourceImageUrl = project.source_image_url;
  if (project.source_image_path) {
    const signedSource = await supabase.storage
      .from("source-images")
      .createSignedUrl(project.source_image_path, 60 * 60 * 6);
    if (signedSource.error || !signedSource.data?.signedUrl) {
    throw new Error("Não foi possível abrir a foto de referência.");
    }
    sourceImageUrl = signedSource.data.signedUrl;
    await supabase
      .from("projects")
      .update({ source_image_url: sourceImageUrl })
      .eq("id", projectId);
  }

  let query = supabase
    .from("photos")
    .select("id, position, generation_prompt")
    .eq("project_id", projectId)
    .eq("status", "queued")
    .order("position");

  if (positions?.length) query = query.in("position", positions);
  if (limit) query = query.limit(limit);

  const { data: photos, error: photosError } = await query;

  if (photosError) {
    throw new Error(`Falha ao carregar gerações: ${photosError.message}`);
  }

  const callbackSecret = process.env.KIE_CALLBACK_SECRET;

  if (!callbackSecret) {
    throw new Error("KIE_CALLBACK_SECRET não configurada.");
  }

  const callbackUrl = new URL("/api/webhooks/kie", appUrl);
  callbackUrl.searchParams.set("secret", callbackSecret);

  const results = await Promise.allSettled(
    (photos ?? []).map(async (photo) => {
      const taskId = await createImageTask({
        prompt: photo.generation_prompt,
        sourceImageUrl,
        contextFinal: project.context_final,
        callbackUrl: callbackUrl.toString(),
      });
      const { error } = await supabase
        .from("photos")
        .update({ kie_task_id: taskId, status: "generating" })
        .eq("id", photo.id);

      if (error) {
        throw new Error(error.message);
      }

      return { photoId: photo.id, position: photo.position, taskId };
    }),
  );
  const started = results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<{
        photoId: string;
        position: number;
        taskId: string;
      }> => result.status === "fulfilled",
    )
    .map((result) => result.value);
  const failed = results.length - started.length;

  if (started.length) {
    await supabase
      .from("projects")
      .update({ status: "generating" })
      .eq("id", projectId);
  }

  return { started, failed };
}
