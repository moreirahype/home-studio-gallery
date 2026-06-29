import assert from "node:assert/strict";
import test from "node:test";
import {
  extraPhotoPricingCentsToReais,
  parseExtraPhotoPricingCents,
  parseStoredExtraPhotoPricingCents,
} from "../lib/extra-photo-pricing.ts";
import {
  getAdditionalPhotoAmountCents,
  getPricingBaseAmountCentsFromFirstExtraAmountCents,
  PROFESSIONAL_EXTRA_PHOTO_PRICING_CENTS,
} from "../lib/pricing.ts";

test("converte tabela recebida em reais para centavos uma única vez", () => {
  assert.deepEqual(parseExtraPhotoPricingCents({ 4: 9.9, 10: "29,90" }), {
    4: 990,
    10: 2990,
  });
});

test("lê tabela armazenada em centavos sem multiplicar novamente", () => {
  assert.deepEqual(parseStoredExtraPhotoPricingCents({ 4: 990, 10: 2990 }), {
    4: 990,
    10: 2990,
  });
  assert.deepEqual(
    extraPhotoPricingCentsToReais({ 4: 990, 10: 2990 }),
    { 4: 9.9, 10: 29.9 },
  );
});

test("mantém a curva profissional configurada", () => {
  const expected = new Map([
    [3, 0],
    [4, 990],
    [5, 1490],
    [6, 1990],
    [7, 2490],
    [8, 2990],
    [9, 2990],
    [10, 2990],
  ]);

  for (const [selectedCount, amountCents] of expected) {
    assert.equal(
      getAdditionalPhotoAmountCents({
        selectedCount,
        includedPhotos: 3,
        paidAmountCents: 2990,
        extraPhotoPricingCents: PROFESSIONAL_EXTRA_PHOTO_PRICING_CENTS,
      }),
      amountCents,
    );
  }
});

test("primeira foto extra universal respeita R$ 9,90", () => {
  const pricingBaseAmountCents =
    getPricingBaseAmountCentsFromFirstExtraAmountCents({
      firstExtraAmountCents: 990,
      includedPhotos: 1,
    });

  assert.equal(
    getAdditionalPhotoAmountCents({
      selectedCount: 2,
      includedPhotos: 1,
      paidAmountCents: 2990,
      pricingBaseAmountCents,
    }),
    990,
  );
});
