import { NewShootForm } from "@/components/new-shoot-form";
import { readFlashOfferToken, verifyExpressOfferToken } from "@/lib/offers";
import { getProjectByToken } from "@/lib/projects";
import {
  DEFAULT_FIRST_EXTRA_AMOUNT_CENTS,
  getFirstExtraAmountCentsFromPricingBaseAmountCents,
} from "@/lib/pricing";

export default async function NewShootPage({
  searchParams,
}: {
  searchParams: Promise<{
    source?: string;
    offer?: string;
    code?: string;
    paidAmount?: string;
    includedPhotos?: string;
    generationCount?: string;
    firstExtraAmount?: string;
  }>;
}) {
  const query = await searchParams;
  const expressOffer =
    query.offer === "express" &&
    verifyExpressOfferToken(query.code, query.source);
  const flashOffer =
    query.offer === "flash"
      ? readFlashOfferToken(query.code, query.source)
      : null;
  const sourceProject = query.source
    ? await getProjectByToken(query.source).catch(() => null)
    : null;
  const sourceFirstExtraAmountCents = sourceProject?.pricing_base_amount_cents
    ? getFirstExtraAmountCentsFromPricingBaseAmountCents({
        pricingBaseAmountCents: Number(sourceProject.pricing_base_amount_cents),
        includedPhotos: Number(sourceProject.included_photos ?? 1),
      })
    : DEFAULT_FIRST_EXTRA_AMOUNT_CENTS;

  return (
    <NewShootForm
      expressOffer={expressOffer}
      offerToken={expressOffer ? query.code : undefined}
      flashOffer={Boolean(flashOffer)}
      flashOfferToken={flashOffer ? query.code : undefined}
      flashExpiresAt={flashOffer?.expiresAt}
      sourceToken={query.source}
      paidAmount={
        flashOffer
          ? flashOffer.paidAmountCents / 100
          : Number(sourceProject?.paid_amount_cents ?? 790) / 100
      }
      includedPhotos={Number(sourceProject?.included_photos ?? 1)}
      generationCount={Number(sourceProject?.generation_count ?? 15)}
      firstExtraAmount={sourceFirstExtraAmountCents / 100}
    />
  );
}
