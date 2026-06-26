export const MAX_PHOTOS = 20;
export const DEFAULT_FIRST_EXTRA_AMOUNT_CENTS = 990;
export const DEFAULT_PROFESSIONAL_PAID_AMOUNT_CENTS = 2990;
export const DEFAULT_PROFESSIONAL_INCLUDED_PHOTOS = 3;
export const DEFAULT_PROFESSIONAL_GENERATION_COUNT = 10;
export const DEFAULT_VIDEO_PRICE_CENTS = 990;
export const DEFAULT_FIRST_IMPRESSION_PACK_PRICE_CENTS = 1490;
export const PROFESSIONAL_EXTRA_PHOTO_PRICING_CENTS: Record<number, number> = {
  4: 990,
  5: 1490,
  6: 1990,
  7: 2490,
  8: 2990,
  9: 2990,
  10: 2990,
};

export const basePricesByQuantity = [
  0, 7.9, 17.8, 25.8, 31.8, 35.8, 39.8, 42.8, 45.8, 49.8, 52.8,
  55.8, 58.8, 61.8, 64.8, 67.8, 71.8, 74.8, 77.8, 80.8, 82.8,
];

const videoPricesByQuantity = [0, 19.9, 29.9, 39.9, 49.9, 59.9];

export function getPricingBaseAmountCentsFromFirstExtraAmountCents({
  firstExtraAmountCents,
  includedPhotos,
}: {
  firstExtraAmountCents: number;
  includedPhotos: number;
}) {
  if (includedPhotos <= 0) return Math.max(1, firstExtraAmountCents);

  const safeIncluded = Math.min(
    MAX_PHOTOS - 1,
    Math.max(1, Math.round(includedPhotos)),
  );
  const baseGap =
    basePricesByQuantity[safeIncluded + 1] -
    basePricesByQuantity[safeIncluded];
  const firstExtraAmount = Math.max(1, firstExtraAmountCents) / 100;
  const pricingBaseAmount =
    firstExtraAmount * (basePricesByQuantity[safeIncluded] / baseGap);

  return Math.round(pricingBaseAmount * 100);
}

function getDefaultPricingBaseAmountCents(includedPhotos: number) {
  return getPricingBaseAmountCentsFromFirstExtraAmountCents({
    firstExtraAmountCents: DEFAULT_FIRST_EXTRA_AMOUNT_CENTS,
    includedPhotos,
  });
}

export function getFirstExtraAmountCentsFromPricingBaseAmountCents({
  pricingBaseAmountCents,
  includedPhotos,
}: {
  pricingBaseAmountCents: number;
  includedPhotos: number;
}) {
  if (includedPhotos <= 0) return Math.max(1, pricingBaseAmountCents);

  const safeIncluded = Math.min(
    MAX_PHOTOS - 1,
    Math.max(1, Math.round(includedPhotos)),
  );
  const baseGap =
    basePricesByQuantity[safeIncluded + 1] -
    basePricesByQuantity[safeIncluded];
  const pricingBaseAmount = Math.max(1, pricingBaseAmountCents) / 100;
  const scale = pricingBaseAmount / basePricesByQuantity[safeIncluded];

  return Math.round(baseGap * scale * 100);
}

export function getAdditionalPhotoAmountCents({
  selectedCount,
  includedPhotos,
  paidAmountCents,
  pricingBaseAmountCents,
  extraPhotoPricingCents,
}: {
  selectedCount: number;
  includedPhotos: number;
  paidAmountCents: number;
  pricingBaseAmountCents?: number | null;
  extraPhotoPricingCents?: Record<number, number> | null;
}) {
  if (selectedCount <= includedPhotos) return 0;

  if (extraPhotoPricingCents) {
    const safeSelected = Math.min(
      MAX_PHOTOS,
      Math.max(1, Math.round(selectedCount)),
    );
    const exactAmount = extraPhotoPricingCents[safeSelected];
    if (typeof exactAmount === "number" && Number.isFinite(exactAmount)) {
      return Math.max(0, Math.round(exactAmount));
    }
  }

  if (includedPhotos <= 0) {
    const safeSelected = Math.min(
      MAX_PHOTOS,
      Math.max(1, Math.round(selectedCount)),
    );
    const firstExtraAmount =
      Math.max(
        1,
        pricingBaseAmountCents ?? DEFAULT_FIRST_EXTRA_AMOUNT_CENTS,
      ) / 100;
    const scale = firstExtraAmount / basePricesByQuantity[1];

    return Math.round(basePricesByQuantity[safeSelected] * scale * 100);
  }

  const safeIncluded = Math.min(
    MAX_PHOTOS,
    Math.max(1, Math.round(includedPhotos)),
  );
  const safeSelected = Math.min(
    MAX_PHOTOS,
    Math.max(1, Math.round(selectedCount)),
  );
  const pricingBaseAmount =
    Math.max(
      1,
      pricingBaseAmountCents ?? getDefaultPricingBaseAmountCents(safeIncluded),
    ) / 100;
  const scale = pricingBaseAmount / basePricesByQuantity[safeIncluded];
  const scaledAdditional = Math.ceil(
    (basePricesByQuantity[safeSelected] - basePricesByQuantity[safeIncluded]) *
      scale *
      100,
  );
  const total = paidAmountCents + Math.max(0, scaledAdditional);

  return Math.max(0, total - paidAmountCents);
}

export function formatReaisFromCents(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

export function getVideoAmountCents(videoCount: number) {
  const safeCount = Math.min(MAX_PHOTOS, Math.max(0, Math.round(videoCount)));
  if (!safeCount) return 0;

  const amount =
    videoPricesByQuantity[safeCount] ??
    videoPricesByQuantity[5] + (safeCount - 5) * 8.9;

  return Math.round(amount * 100);
}

export function getLinearAddonAmountCents({
  count,
  unitAmountCents,
}: {
  count: number;
  unitAmountCents: number;
}) {
  const safeCount = Math.min(MAX_PHOTOS, Math.max(0, Math.round(count)));
  return safeCount * Math.max(0, Math.round(unitAmountCents));
}

export function professionalPricingDefaults() {
  return {
    paidAmountCents: DEFAULT_PROFESSIONAL_PAID_AMOUNT_CENTS,
    includedPhotos: DEFAULT_PROFESSIONAL_INCLUDED_PHOTOS,
    generationCount: DEFAULT_PROFESSIONAL_GENERATION_COUNT,
    extraPhotoPricingCents: PROFESSIONAL_EXTRA_PHOTO_PRICING_CENTS,
    videoPriceCents: DEFAULT_VIDEO_PRICE_CENTS,
    firstImpressionPackPriceCents: DEFAULT_FIRST_IMPRESSION_PACK_PRICE_CENTS,
  };
}
