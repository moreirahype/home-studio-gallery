import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { unauthorized } from "@/lib/http";
import { safeCompare } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const requestSchema = z.object({
  taskId: z.string().min(8).optional(),
  projectId: z.string().uuid().optional(),
  galleryToken: z.string().min(8).optional(),
});

export async function POST(request: NextRequest) {
  if (
    !safeCompare(
      request.headers.get("x-webhook-secret"),
      process.env.GENERATION_SECRET ?? process.env.ZAPDATA_WEBHOOK_SECRET,
    )
  ) {
    return unauthorized();
  }

  const parsed = requestSchema.safeParse(await request.json());

  if (
    !parsed.success ||
    !process.env.KIE_CALLBACK_SECRET ||
    (!parsed.data.taskId && !parsed.data.projectId && !parsed.data.galleryToken)
  ) {
    return NextResponse.json(
      { ok: false, error: "Pedido de recuperacao invalido." },
      { status: 400 },
    );
  }

  const callbackUrl = new URL(
    "/api/webhooks/kie",
    process.env.APP_URL ?? request.nextUrl.origin,
  );
  callbackUrl.searchParams.set("secret", process.env.KIE_CALLBACK_SECRET);

  async function recoverTask(taskId: string) {
    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
    const result = await response.json();
    return { status: response.status, result };
  }

  if (parsed.data.taskId) {
    const recovered = await recoverTask(parsed.data.taskId);
    return NextResponse.json(recovered.result, { status: recovered.status });
  }

  const supabase = getSupabaseAdmin();
  let projectId = parsed.data.projectId;

  if (!projectId && parsed.data.galleryToken) {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("gallery_token", parsed.data.galleryToken)
      .maybeSingle();
    projectId = project?.id;
  }

  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: "Galeria nao encontrada." },
      { status: 404 },
    );
  }

  const { data: photos, error } = await supabase
    .from("photos")
    .select("id, position, kie_task_id, status")
    .eq("project_id", projectId)
    .not("kie_task_id", "is", null)
    .order("position");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const recovered = [];
  for (const photo of photos ?? []) {
    const taskId = photo.kie_task_id as string | null;
    if (!taskId || photo.status === "ready") continue;
    recovered.push({
      photoId: photo.id,
      position: photo.position,
      taskId,
      ...(await recoverTask(taskId)),
    });
  }

  return NextResponse.json({
    ok: true,
    projectId,
    attempted: recovered.length,
    recovered,
  });
}
