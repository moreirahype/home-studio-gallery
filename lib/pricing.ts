const MAX_PHOTOS = 20;

const basePricesByQuantity = [
  0, 7.9, 17.8, 25.8, 31.8, 35.8, 39.8, 42.8, 45.8, 49.8, 52.8,
  55.8, 58.8, 61.8, 64.8, 67.8, 71.8, 74.8, 77.8, 80.8, 82.8,
];

const videoPricesByQuantity = [0, 19.9, 29.9, 39.9, 49.9, 59.9];

export function getAdditionalPhotoAmountCents({
  selectedCount,
  includedPhotos,
  paidAmountCents,
}: {
  selectedCount: number;
  includedPhotos: number;
  paidAmountCents: number;
}) {
  if (selectedCount <= includedPhotos) return 0;

  const safeIncluded = Math.min(
    MAX_PHOTOS,
    Math.max(1, Math.round(includedPhotos)),
  );
  const safeSelected = Math.min(
    MAX_PHOTOS,
    Math.max(1, Math.round(selectedCount)),
  );
  const paidAmount = Math.max(1, paidAmountCents) / 100;
  const scale = paidAmount / basePricesByQuantity[safeIncluded];
  const total = Math.round(basePricesByQuantity[safeSelected] * scale * 100);

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
