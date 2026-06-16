const MAX_PHOTOS = 20;

const basePricesByQuantity = [
  0, 7.9, 15.8, 22.8, 27.8, 32.8, 37.3, 41.3, 45.3, 49.3, 52.8,
  56.3, 59.3, 62.3, 65.3, 67.8, 71.3, 74.3, 77.3, 80.3, 82.8,
];

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
