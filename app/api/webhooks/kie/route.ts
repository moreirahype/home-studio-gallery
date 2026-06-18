import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTaskDetails } from "@/lib/kie";
import { createWatermarkedPreview } from "@/lib/photo-processing";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { assembleVideo } from "@/lib/video";
import { unauthorized } from "@/lib/http";
import { safeCompare } from "@/lib/security";

const callbackSchema = z
  .object({
    taskId: z.string().min(1).optional(),
    state: z.string().optional(),
    resultUrls: z.array(z.string().url()).optional(),
    resultJson: z.string().optional(),
    failMsg: z.string().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

export const maxDuration = 300;

function extractTaskId(payload: z.infer<typeof callbackSchema>) {
  if (payload.taskId) return payload.taskId;
  if (
    payload.data &&
    typeof payload.data === "object" &&
    "taskId" in payload.data &&
    typeof payload.data.taskId === "string"
  ) {
    return payload.data.taskId;
  }

  return null;
}

function parseResultUrls(value?: string) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as { resultUrls?: unknown };
    return Array.isArray(parsed.resultUrls)
      ? parsed.resultUrls.filter(
          (url): url is string =>
            typeof url === "string" && URL.canParse(url),
        )
      : [];
  } catch {
    return [];
  }
}

async function handleVideoTask(taskId: string) {
  const supabase = getSupabaseAdmin();
  const { data: clip } = await supabase
    .from("video_clips")
    .select("id, video_job_id")
    .eq("task_id", taskId)
    .maybeSingle();

  if (!clip) return null;

  const task = await getTaskDetails(taskId);
  const resultUrl = parseResultUrls(task.resultJson)[0];

  if (task.state === "fail") {
    await supabase
      .from("video_clips")
      .update({
        status: "failed",
        error_message: task.failMsg || "A KIE não concluiu o clipe.",
      })
      .eq("id", clip.id);
    await supabase
      .from("video_jobs")
      .update({ status: "failed", error_message: task.failMsg })
      .eq("id", clip.video_job_id);
    return { ok: true, taskId, state: task.state, kind: "video" };
  }

  if (task.state !== "success" || !resultUrl) {
    return {
      ok: true,
      taskId,
      state: task.state || "generating",
      kind: "video",
    };
  }

  const response = await fetch(resultUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Download do clipe respondeu HTTP ${response.status}.`);
  }
  const clipPath = `${clip.video_job_id}/${taskId}.mp4`;
  const upload = await supabase.storage
    .from("video-clips")
    .upload(clipPath, Buffer.from(await response.arrayBuffer()), {
      contentType: "video/mp4",
      upsert: true,
    });
  if (upload.error) throw new Error(upload.error.message);
  await supabase
    .from("video_clips")
    .update({ path: clipPath, status: "ready", error_message: null })
    .eq("id", clip.id);
  const assembled = await assembleVideo(clip.video_job_id);

  return {
    ok: true,
    taskId,
    state: task.state,
    kind: "video",
    assembled,
  };
}

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");

  if (!safeCompare(secret, process.env.KIE_CALLBACK_SECRET)) {
    return unauthorized();
  }

  const parsed = callbackSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Callback inválido." }, { status: 400 });
  }

  const taskId = extractTaskId(parsed.data);

  if (!taskId) {
    return NextResponse.json(
      { ok: false, error: "Callback sem taskId." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: photo } = await supabase
    .from("photos")
    .select("id, project_id, position")
    .eq("kie_task_id", taskId)
    .maybeSingle();

  if (!photo) {
    try {
      const videoResult = await handleVideoTask(taskId);
      if (videoResult) return NextResponse.json(videoResult);
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          taskId,
          error:
            error instanceof Error ? error.message : "Falha ao processar clipe.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Tarefa não encontrada." },
      { status: 404 },
    );
  }

  const nestedData =
    parsed.data.data && typeof parsed.data.data === "object"
      ? parsed.data.data
      : {};
  const task = await getTaskDetails(taskId);
  const state =
    task.state ??
    parsed.data.state ??
    ("state" in nestedData && typeof nestedData.state === "string"
      ? nestedData.state
      : "");
  const resultUrls = [
    ...(parsed.data.resultUrls ?? []),
    ...parseResultUrls(parsed.data.resultJson),
    ...parseResultUrls(task.resultJson),
    ...("resultJson" in nestedData &&
    typeof nestedData.resultJson === "string"
      ? parseResultUrls(nestedData.resultJson)
      : []),
  ];

  if (state === "fail") {
    const errorMessage =
      task.failMsg || parsed.data.failMsg || "A KIE não concluiu a imagem.";
    await supabase
      .from("photos")
      .update({ status: "failed", error_message: errorMessage })
      .eq("id", photo.id);
    return NextResponse.json({ ok: true, taskId, state });
  }

  const resultUrl = resultUrls[0];

  if (state !== "success" || !resultUrl) {
    return NextResponse.json({ ok: true, taskId, state: state || "generating" });
  }

  try {
    const imageResponse = await fetch(resultUrl, { cache: "no-store" });

    if (!imageResponse.ok) {
      throw new Error(`Download respondeu HTTP ${imageResponse.status}.`);
    }

    const original = Buffer.from(await imageResponse.arrayBuffer());
    const preview = await createWatermarkedPreview(original);
    const originalPath = `${photo.project_id}/${photo.position}.png`;
    const previewPath = `${photo.project_id}/${photo.position}.jpg`;
    const [originalUpload, previewUpload] = await Promise.all([
      supabase.storage.from("photo-originals").upload(originalPath, original, {
        contentType: imageResponse.headers.get("content-type") ?? "image/png",
        upsert: true,
      }),
      supabase.storage.from("photo-previews").upload(previewPath, preview, {
        contentType: "image/jpeg",
        upsert: true,
      }),
    ]);

    if (originalUpload.error || previewUpload.error) {
      throw new Error(
        originalUpload.error?.message ||
          previewUpload.error?.message ||
          "Falha ao armazenar imagem.",
      );
    }

    await supabase
      .from("photos")
      .update({
        original_path: originalPath,
        preview_path: previewPath,
        status: "ready",
        error_message: null,
      })
      .eq("id", photo.id);

    const { count: pendingCount } = await supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("project_id", photo.project_id)
      .in("status", ["queued", "generating"]);

    if (!pendingCount) {
      await supabase
        .from("projects")
        .update({ status: "ready" })
        .eq("id", photo.project_id);
      await supabase
        .from("repeat_shoots")
        .update({ status: "ready" })
        .eq("project_id", photo.project_id);
    }

    return NextResponse.json({ ok: true, taskId, state, photoId: photo.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao processar imagem.";
    await supabase
      .from("photos")
      .update({ status: "failed", error_message: message })
      .eq("id", photo.id);

    return NextResponse.json(
      { ok: false, taskId, error: message },
      { status: 500 },
    );
  }
}
