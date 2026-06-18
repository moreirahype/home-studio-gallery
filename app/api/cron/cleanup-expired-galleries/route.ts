import { NextRequest, NextResponse } from "next/server";
import { safeCompare } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function compactPaths(paths: Array<string | null | undefined>) {
  return [...new Set(paths.filter((path): path is string => Boolean(path)))];
}

async function removeStorageFiles(bucket: string, paths: string[]) {
  if (!paths.length) return;
  const supabase = getSupabaseAdmin();
  await supabase.storage.from(bucket).remove(paths);
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "") ?? null;

  if (process.env.CRON_SECRET && !safeCompare(token, process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, source_image_path, expires_at")
    .lt("expires_at", new Date().toISOString())
    .limit(25);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  let cleaned = 0;

  for (const project of projects ?? []) {
    const { data: photos } = await supabase
      .from("photos")
      .select("id, original_path, preview_path")
      .eq("project_id", project.id);
    const { data: videoJobs } = await supabase
      .from("video_jobs")
      .select("id, output_path")
      .eq("project_id", project.id);
    const videoJobIds = (videoJobs ?? []).map((job) => job.id);
    const { data: videoClips } = videoJobIds.length
      ? await supabase
          .from("video_clips")
          .select("id, path")
          .in("video_job_id", videoJobIds)
      : { data: [] };

    await Promise.all([
      removeStorageFiles(
        "photo-originals",
        compactPaths((photos ?? []).map((photo) => photo.original_path)),
      ),
      removeStorageFiles(
        "photo-previews",
        compactPaths((photos ?? []).map((photo) => photo.preview_path)),
      ),
      removeStorageFiles(
        "videos",
        compactPaths((videoJobs ?? []).map((job) => job.output_path)),
      ),
      removeStorageFiles(
        "video-clips",
        compactPaths((videoClips ?? []).map((clip) => clip.path)),
      ),
      removeStorageFiles("source-images", compactPaths([project.source_image_path])),
    ]);

    await supabase
      .from("photos")
      .update({ original_path: null, preview_path: null })
      .eq("project_id", project.id);
    if (videoJobIds.length) {
      await supabase
        .from("video_jobs")
        .update({ output_path: null })
        .eq("project_id", project.id);
      await supabase
        .from("video_clips")
        .update({ path: null })
        .in("video_job_id", videoJobIds);
    }

    cleaned += 1;
  }

  return NextResponse.json({ ok: true, cleaned });
}

