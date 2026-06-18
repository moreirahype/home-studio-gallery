import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { createVideoTask, KIE_VIDEO_MODEL } from "@/lib/kie";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const execFileAsync = promisify(execFile);
const MOVEMENT_PROMPTS = [
  "Refined luxury portrait video. Very slow cinematic camera push-in. The person remains nearly still with one natural blink. Preserve the exact face, expression, body, clothes, hands and background from the source image. No talking, smiling, head movement, morphing or new objects.",
  "Refined luxury portrait video. Subtle horizontal camera slide creating gentle depth. The person remains completely still. Preserve the exact identity, facial expression, anatomy, clothes, hands and scene from the source image. No orbit, talking, gestures, morphing or new objects.",
  "Refined luxury portrait video. Very slow cinematic camera pull-back. The person remains nearly still with only natural breathing. Preserve the exact face, expression, body, clothes, hands and environment from the source image. No talking, smiling, head movement, morphing or new objects.",
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

export async function assembleVideo(videoJobId: string) {
  if (!ffmpegPath) throw new Error("FFmpeg não disponível.");
  const supabase = getSupabaseAdmin();
  const { data: clips, error } = await supabase
    .from("video_clips")
    .select("path, created_at")
    .eq("video_job_id", videoJobId)
    .eq("status", "ready")
    .order("created_at");

  if (error || clips?.length !== 3) return false;

  const workdir = path.join(tmpdir(), `home-studio-${randomUUID()}`);
  await mkdir(workdir, { recursive: true });

  try {
    const clipPaths: string[] = [];

    for (let index = 0; index < clips.length; index += 1) {
      const storagePath = clips[index].path as string;
      const downloaded = await supabase.storage
        .from("video-clips")
        .download(storagePath);
      if (downloaded.error) throw new Error(downloaded.error.message);
      const localPath = path.join(workdir, `clip-${index}.mp4`);
      await writeFile(
        localPath,
        Buffer.from(await downloaded.data.arrayBuffer()),
      );
      clipPaths.push(localPath);
    }

    const listPath = path.join(workdir, "clips.txt");
    const outputPath = path.join(workdir, "video.mp4");
    const musicPath = path.join(
      process.cwd(),
      "assets",
      "audio",
      "tech-house-vibes.mp3",
    );
    await writeFile(
      listPath,
      clipPaths
        .map((clipPath) => `file '${clipPath.replaceAll("'", "'\\''")}'`)
        .join("\n"),
    );
    await execFileAsync(ffmpegPath, [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-stream_loop",
      "-1",
      "-ss",
      "8",
      "-i",
      musicPath,
      "-filter_complex",
      "[1:a]volume=0.16,afade=t=in:st=0:d=0.8,afade=t=out:st=13:d=1.5[audio]",
      "-map",
      "0:v:0",
      "-map",
      "[audio]",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-t",
      "15",
      "-shortest",
      outputPath,
    ]);
    const output = await readFile(outputPath);
    const storagePath = `${videoJobId}/video.mp4`;
    const upload = await supabase.storage
      .from("videos")
      .upload(storagePath, output, {
        contentType: "video/mp4",
        upsert: true,
      });
    if (upload.error) throw new Error(upload.error.message);
    await supabase
      .from("video_jobs")
      .update({ output_path: storagePath, status: "ready" })
      .eq("id", videoJobId);
    return true;
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
