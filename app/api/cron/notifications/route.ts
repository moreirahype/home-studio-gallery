import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { safeCompare } from "@/lib/security";

const campaigns = [
  {
    title: "Seu próximo ensaio pode ser completamente diferente",
    body: "Escolha um novo tema, receba 10 opções e leve 1 foto por R$ 7,90.",
  },
  {
    title: "Uma nova versão sua está esperando",
    body: "Profissional, luxo, casual ou romântico: crie outro ensaio pelo app.",
  },
  {
    title: "Fotos novas para o seu perfil",
    body: "Crie 10 opções em um novo tema e escolha sua favorita.",
  },
];

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const cronSecret = authorization?.replace(/^Bearer\s+/i, "") ?? null;

  if (!safeCompare(cronSecret, process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    return NextResponse.json(
      { ok: false, error: "VAPID não configurado." },
      { status: 500 },
    );
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:contato@homestudio.app",
    publicKey,
    privateKey,
  );

  const supabase = getSupabaseAdmin();
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, campaign_index")
    .eq("active", true)
    .lte("next_notification_at", new Date().toISOString())
    .limit(500);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  let sent = 0;

  for (const subscription of subscriptions ?? []) {
    const campaign = campaigns[subscription.campaign_index % campaigns.length];

    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify({ ...campaign, url: "/novo" }),
      );

      const nextNotificationAt = new Date();
      nextNotificationAt.setDate(nextNotificationAt.getDate() + 14);

      await supabase
        .from("push_subscriptions")
        .update({
          campaign_index: subscription.campaign_index + 1,
          last_notified_at: new Date().toISOString(),
          next_notification_at: nextNotificationAt.toISOString(),
        })
        .eq("id", subscription.id);
      sent += 1;
    } catch (pushError) {
      const statusCode =
        typeof pushError === "object" &&
        pushError &&
        "statusCode" in pushError
          ? Number(pushError.statusCode)
          : 0;

      if (statusCode === 404 || statusCode === 410) {
        await supabase
          .from("push_subscriptions")
          .update({ active: false })
          .eq("id", subscription.id);
      }
    }
  }

  return NextResponse.json({ ok: true, sent });
}
