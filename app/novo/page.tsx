import { NewShootForm } from "@/components/new-shoot-form";
import { verifyExpressOfferToken } from "@/lib/offers";

export default async function NewShootPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; offer?: string; code?: string }>;
}) {
  const query = await searchParams;
  const expressOffer =
    query.offer === "express" &&
    verifyExpressOfferToken(query.code, query.source);

  return (
    <NewShootForm
      expressOffer={expressOffer}
      offerToken={expressOffer ? query.code : undefined}
      sourceToken={query.source}
      vipOffer={query.offer === "vip"}
    />
  );
}
