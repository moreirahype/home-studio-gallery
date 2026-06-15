import { Gallery, type GalleryOffer } from "@/components/gallery";
import { getProjectByToken } from "@/lib/projects";
import { createExpressOfferToken } from "@/lib/offers";
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
        gallerySize: project.generation_count,
        videoPrice: Number(process.env.VIDEO_UPSELL_PRICE) || 14.9,
        newShootPrice: Number(process.env.NEW_SHOOT_UPSELL_PRICE) || 7.9,
        expressShootPrice:
          Number(process.env.EXPRESS_SHOOT_DOWNSELL_PRICE) || 4.9,
      }
    : {
        paidAmount: Number(query.paidAmount) || 7.9,
        includedPhotos: Number(query.includedPhotos) || 1,
        gallerySize: 15,
        videoPrice: Number(process.env.VIDEO_UPSELL_PRICE) || 14.9,
        newShootPrice: Number(process.env.NEW_SHOOT_UPSELL_PRICE) || 7.9,
        expressShootPrice:
          Number(process.env.EXPRESS_SHOOT_DOWNSELL_PRICE) || 4.9,
      };

  return (
    <Gallery
      expressOfferToken={createExpressOfferToken(token)}
      galleryPhotos={project?.photos}
      offer={offer}
      testMode={query.test === "1"}
      token={token}
    />
  );
}
