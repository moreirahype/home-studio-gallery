import { Gallery, type GalleryOffer } from "@/components/gallery";

export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    paidAmount?: string;
    includedPhotos?: string;
  }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const demoOffer: Partial<GalleryOffer> | undefined =
    token === "demo"
      ? {
          paidAmount: Number(query.paidAmount) || 4.9,
          includedPhotos: Number(query.includedPhotos) || 1,
        }
      : undefined;

  // Production galleries will load this offer from the project stored by token.
  return <Gallery offer={demoOffer} token={token} />;
}
