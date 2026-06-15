import { createHmac, timingSafeEqual } from "node:crypto";

const EXPRESS_OFFER_TTL_SECONDS = 30 * 60;

function getOfferSecret() {
  const secret =
    process.env.DOWNSELL_SECRET ??
    process.env.GENERATION_SECRET ??
    process.env.ZAPDATA_WEBHOOK_SECRET;

  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "home-studio-local-offers";
  throw new Error("DOWNSELL_SECRET não configurada.");
}

function sign(payload: string) {
  return createHmac("sha256", getOfferSecret())
    .update(payload)
    .digest("base64url");
}

export function createExpressOfferToken(sourceToken: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + EXPRESS_OFFER_TTL_SECONDS;
  const payload = Buffer.from(
    JSON.stringify({ sourceToken, expiresAt }),
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifyExpressOfferToken(
  token: string | undefined,
  sourceToken: string | undefined,
) {
  if (!token || !sourceToken) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { sourceToken?: string; expiresAt?: number };

    return (
      parsed.sourceToken === sourceToken &&
      typeof parsed.expiresAt === "number" &&
      parsed.expiresAt >= Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}
