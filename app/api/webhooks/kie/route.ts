import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTaskDetails } from "@/lib/kie";
import { createWatermarkedPreview } from "@/lib/photo-processing";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
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
    return extractUrls(JSON.parse(value));
  } catch {
    return [];
  }
}

function extractUrls(value: unknown): string[] {
  if (!value) return [];

  if (typeof value === "string") {
    if (URL.canParse(value)) return [value];
    try {
      return extractUrls(JSON.parse(value));
    } catch {
      return [];
    }
  }

  if (Array.isArray(value)) {
    return value.flatMap(extractUrls);
  }

  if (typeof value === "object") {
    return Object.values(value).flatMap(extractUrls);
  }

  return [];
}

async function handleVideoTask(
  taskId: string,
  payload: z.infer<typeof callbackSchema>,
) {
  const supabase = getSupabaseAdmin();
  const { data: clip } = await supabase
    .from("video_clips")
    .select("id, video_job_id")
    .eq("task_id", taskId)
    .maybeSingle();

  if (!clip) return null;

  const nestedData =
    payload.data && typeof payload.data === "object" ? payload.data : {};
  const task = await getTaskDetails(taskId);
  const state =
    task.state ??
    payload.state ??
    ("state" in nestedData && typeof nestedData.state === "string"
      ? nestedData.state
      : "");
  const resultUrl = [
    ...(payload.resultUrls ?? []),
    ...parseResultUrls(payload.resultJson),
    ...parseResultUrls(task.resultJson),
    ...("resultUrls" in nestedData ? extractUrls(nestedData.resultUrls) : []),
    ...("resultJson" in nestedData &&
    typeof nestedData.resultJson === "string"
      ? parseResultUrls(nestedData.resultJson)
      : []),
  ].find((url) => URL.canParse(url));

  if (state === "fail") {
    await supabase
      .from("video_clips")
      .update({
        status: "failed",
        error_message:
          task.failMsg || payload.failMsg || "A KIE não concluiu o clipe.",
      })
      .eq("id", clip.id);
    await supabase
      .from("video_jobs")
      .update({ status: "failed", error_message: task.failMsg || payload.failMsg })
      .eq("id", clip.video_job_id);
    return { ok: true, taskId, state, kind: "video" };
  }

  if (state !== "success" || !resultUrl) {
    return {
      ok: true,
      taskId,
      state: state || "generating",
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

  const { data: clips } = await supabase
    .from("video_clips")
    .select("status")
    .eq("video_job_id", clip.video_job_id);
  const allReady =
    Boolean(clips?.length) &&
    clips?.every((videoClip) => videoClip.status === "ready");

  if (allReady) {
    await supabase
      .from("video_jobs")
      .update({ status: "ready", error_message: null })
      .eq("id", clip.video_job_id);
  }

  return {
    ok: true,
    taskId,
    state,
    kind: "video",
    ready: allReady,
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
      const videoResult = await handleVideoTask(taskId, parsed.data);
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
