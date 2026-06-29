import {
  DEFAULT_FIRST_IMPRESSION_PACK_PRICE_CENTS,
  DEFAULT_PROFESSIONAL_GENERATION_COUNT,
  DEFAULT_PROFESSIONAL_INCLUDED_PHOTOS,
  DEFAULT_PROFESSIONAL_PAID_AMOUNT_CENTS,
  DEFAULT_VIDEO_PRICE_CENTS,
  PROFESSIONAL_EXTRA_PHOTO_PRICING_CENTS,
} from "@/lib/pricing";
export {
  extraPhotoPricingCentsToReais,
  parseExtraPhotoPricingCents,
  parseStoredExtraPhotoPricingCents,
} from "@/lib/extra-photo-pricing";

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
    videoPriceCents: videoPriceCents ?? DEFAULT_VIDEO_PRICE_CENTS,
    firstImpressionPackPriceCents:
      firstImpressionPackPriceCents ?? DEFAULT_FIRST_IMPRESSION_PACK_PRICE_CENTS,
  };
}
