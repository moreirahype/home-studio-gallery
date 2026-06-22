import { createHash } from "node:crypto";

type MetaPurchaseEvent = {
  eventId: string;
  value: number;
  currency?: string;
  customerName?: string | null;
  phone?: string | null;
  email?: string | null;
  eventSourceUrl?: string;
  contentIds?: string[];
};

function normalizeHashInput(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function sha256(value?: string | null) {
  const normalized = normalizeHashInput(value);
  if (!normalized) return undefined;
  return createHash("sha256").update(normalized).digest("hex");
}

function sha256Phone(value?: string | null) {
  const digits = value?.replace(/\D/g, "");
  return sha256(digits);
}

function splitName(name?: string | null) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts[parts.length - 1] : undefined,
  };
}

export async function reportMetaPurchase({
  eventId,
  value,
  currency = "BRL",
  customerName,
  phone,
  email,
  eventSourceUrl,
  contentIds = ["home-studio-gallery"],
}: MetaPurchaseEvent) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!pixelId || !accessToken || value <= 0) {
    return { skipped: true };
  }

  const { firstName, lastName } = splitName(customerName);
  const response = await fetch(
    `https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${accessToken}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        data: [
          {
            event_name: "Purchase",
            event_time: Math.floor(Date.now() / 1000),
            event_id: eventId,
            action_source: "website",
            event_source_url: eventSourceUrl,
            user_data: {
              ph: sha256Phone(phone),
              em: sha256(email),
              fn: sha256(firstName),
              ln: sha256(lastName),
              external_id: sha256(eventId),
            },
            custom_data: {
              currency,
              value: Number(value.toFixed(2)),
              content_ids: contentIds,
              content_type: "product",
            },
          },
        ],
        ...(process.env.META_TEST_EVENT_CODE
          ? { test_event_code: process.env.META_TEST_EVENT_CODE }
          : {}),
      }),
    },
  );

  const result = (await response.json().catch(() => ({}))) as {
    events_received?: number;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      result.error?.message ?? `Meta respondeu HTTP ${response.status}.`,
    );
  }

  return result;
}
