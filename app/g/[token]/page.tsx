import { Gallery } from "@/components/gallery";

export default async function GalleryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <Gallery token={token} />;
}
