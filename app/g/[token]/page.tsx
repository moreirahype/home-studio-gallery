import { Gallery, type GalleryOffer } from "@/components/gallery";
import { getProjectByToken } from "@/lib/projects";
import { notFound } from "next/navigation";

export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    paidAmount?: string;
    includedPhotos?: string;
    test?: string;
  }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const isDemo = token === "demo";
  const project = isDemo ? null : await getProjectByToken(token);

  if (!isDemo && !project) {
    notFound();
  }

  const offer: Partial<GalleryOffer> = project
    ? {
        paidAmount: project.paid_amount_cents / 100,
        includedPhotos: project.included_photos,
      }
    : {
        paidAmount: Number(query.paidAmount) || 4.9,
        includedPhotos: Number(query.includedPhotos) || 1,
      };

  return (
    <Gallery
      offer={offer}
      testMode={query.test === "1"}
      token={token}
    />
  );
}
