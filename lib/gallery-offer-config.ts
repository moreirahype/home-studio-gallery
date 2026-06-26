import {
  DEFAULT_FIRST_IMPRESSION_PACK_PRICE_CENTS,
  DEFAULT_PROFESSIONAL_GENERATION_COUNT,
  DEFAULT_PROFESSIONAL_INCLUDED_PHOTOS,
  DEFAULT_PROFESSIONAL_PAID_AMOUNT_CENTS,
  DEFAULT_VIDEO_PRICE_CENTS,
  PROFESSIONAL_EXTRA_PHOTO_PRICING_CENTS,
} from "@/lib/pricing";

export type GalleryType = "universal" | "professional";

export function normalizeGalleryType(value?: string | null): GalleryType {
  const normalized = value?.trim().toLowerCase();
  return normalized === "professional" || normalized === "profissional"
    ? "professional"
    : "universal";
}

export function professionalExtraPricingJson() {
  return PROFESSIONAL_EXTRA_PHOTO_PRICING_CENTS as Record<number, number>;
}

export function parseExtraPhotoPricingCents(value: unknown) {
  if (!value) return null;
  const source =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return null;
          }
        })()
      : value;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }

  const entries = Object.entries(source as Record<string, unknown>)
    .map(([key, amount]) => {
      const quantity = Number(key);
      const valueNumber =
        typeof amount === "number"
          ? amount
          : typeof amount === "string"
            ? Number(amount.replace(",", "."))
            : NaN;

      if (!Number.isFinite(quantity) || !Number.isFinite(valueNumber)) return null;
      return [Math.round(quantity), Math.round(valueNumber * 100)] as const;
    })
    .filter((entry): entry is readonly [number, number] => Boolean(entry));

  return entries.length ? Object.fromEntries(entries) : null;
}

export function resolveOfferDefaults({
  galleryType,
  paidAmountCents,
  includedPhotos,
  generationCount,
  extraPhotoPricingCents,
  videoPriceCents,
  firstImpressionPackPriceCents,
}: {
  galleryType: GalleryType;
  paidAmountCents?: number | null;
  includedPhotos?: number | null;
  generationCount?: number | null;
  extraPhotoPricingCents?: Record<number, number> | null;
  videoPriceCents?: number | null;
  firstImpressionPackPriceCents?: number | null;
}) {
  if (galleryType === "professional") {
    return {
      paidAmountCents: paidAmountCents ?? DEFAULT_PROFESSIONAL_PAID_AMOUNT_CENTS,
      includedPhotos: includedPhotos ?? DEFAULT_PROFESSIONAL_INCLUDED_PHOTOS,
      generationCount: generationCount ?? DEFAULT_PROFESSIONAL_GENERATION_COUNT,
      extraPhotoPricingCents:
        extraPhotoPricingCents ?? PROFESSIONAL_EXTRA_PHOTO_PRICING_CENTS,
      videoPriceCents: videoPriceCents ?? DEFAULT_VIDEO_PRICE_CENTS,
      firstImpressionPackPriceCents:
        firstImpressionPackPriceCents ??
        DEFAULT_FIRST_IMPRESSION_PACK_PRICE_CENTS,
    };
  }

  return {
    paidAmountCents: paidAmountCents ?? 790,
    includedPhotos: includedPhotos ?? 1,
    generationCount: generationCount ?? 15,
    extraPhotoPricingCents: extraPhotoPricingCents ?? null,
    videoPriceCents: videoPriceCents ?? 1990,
    firstImpressionPackPriceCents:
      firstImpressionPackPriceCents ?? DEFAULT_FIRST_IMPRESSION_PACK_PRICE_CENTS,
  };
}
