import { Gallery, type GalleryOffer } from "@/components/gallery";
import {
  normalizeGalleryType,
  parseExtraPhotoPricingCents,
  professionalExtraPricingJson,
} from "@/lib/gallery-offer-config";
import { getProjectByToken } from "@/lib/projects";
import { getPricingBaseAmountCentsFromFirstExtraAmountCents } from "@/lib/pricing";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    paidAmount?: string;
    firstExtraAmount?: string;
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
        pricingBaseAmount:
          project.pricing_base_amount_cents === null ||
          project.pricing_base_amount_cents === undefined
            ? undefined
            : project.pricing_base_amount_cents / 100,
        includedPhotos: project.included_photos,
        gallerySize: project.generation_count,
        galleryType: normalizeGalleryType(project.gallery_type),
        extraPhotoPricing:
          parseExtraPhotoPricingCents(project.extra_photo_pricing) ??
          (normalizeGalleryType(project.gallery_type) === "professional"
            ? professionalExtraPricingJson()
            : null),
        videoPrice:
          (project.video_price_cents ?? null) === null
            ? Number(process.env.VIDEO_UPSELL_PRICE) || 19.9
            : Number(project.video_price_cents) / 100,
        firstImpressionPackPrice:
          (project.first_impression_pack_price_cents ?? null) === null
            ? 14.9
            : Number(project.first_impression_pack_price_cents) / 100,
        newShootPrice: project.paid_amount_cents / 100,
        expressShootPrice:
          Number(process.env.EXPRESS_SHOOT_DOWNSELL_PRICE) || 4.9,
      }
    : {
        paidAmount: Number(query.paidAmount) || 7.9,
        pricingBaseAmount: Number(query.firstExtraAmount)
          ? getPricingBaseAmountCentsFromFirstExtraAmountCents({
              firstExtraAmountCents: Math.round(
                Number(query.firstExtraAmount) * 100,
              ),
              includedPhotos: Number(query.includedPhotos) || 1,
            }) / 100
          : undefined,
        includedPhotos: Number(query.includedPhotos) || 1,
        gallerySize: 15,
        galleryType: "universal",
        extraPhotoPricing: null,
        videoPrice: Number(process.env.VIDEO_UPSELL_PRICE) || 19.9,
        firstImpressionPackPrice: 14.9,
        newShootPrice: Number(query.paidAmount) || 7.9,
        expressShootPrice:
          Number(process.env.EXPRESS_SHOOT_DOWNSELL_PRICE) || 4.9,
      };

  return (
    <Gallery
      galleryPhotos={project?.photos}
      offer={offer}
      testMode={query.test === "1"}
      token={token}
    />
  );
}
