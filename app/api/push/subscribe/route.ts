import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const subscriptionSchema = z.object({
  projectToken: z.string().min(8),
  subscription: z.object({
    endpoint: z.string().url(),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

export async function POST(request: NextRequest) {
  const parsed = subscriptionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Inscrição inválida." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("gallery_token", parsed.data.projectToken)
    .maybeSingle();

  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Galeria não encontrada." },
      { status: 404 },
    );
  }

  const nextNotificationAt = new Date();
  nextNotificationAt.setDate(nextNotificationAt.getDate() + 7);

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      project_id: project.id,
      endpoint: parsed.data.subscription.endpoint,
      p256dh: parsed.data.subscription.keys.p256dh,
      auth: parsed.data.subscription.keys.auth,
      next_notification_at: nextNotificationAt.toISOString(),
      active: true,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Falha ao ativar notificações: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
