import { NewShootForm } from "@/components/new-shoot-form";
import { verifyExpressOfferToken } from "@/lib/offers";

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
  const parseAmount = (value: string | undefined, fallback: number) => {
    const normalized = Number(value?.replace(",", "."));
    return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
  };
  const parseCount = (value: string | undefined, fallback: number) => {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized > 0
      ? Math.round(normalized)
      : fallback;
  };

  return (
    <NewShootForm
      expressOffer={expressOffer}
      offerToken={expressOffer ? query.code : undefined}
      sourceToken={query.source}
      paidAmount={parseAmount(query.paidAmount, 7.9)}
      includedPhotos={parseCount(query.includedPhotos, 1)}
      generationCount={parseCount(query.generationCount, 15)}
      firstExtraAmount={parseAmount(query.firstExtraAmount, 9.9)}
    />
  );
}
