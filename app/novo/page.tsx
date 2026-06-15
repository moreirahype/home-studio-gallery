import { NewShootForm } from "@/components/new-shoot-form";

export default async function NewShootPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const query = await searchParams;
  return <NewShootForm sourceToken={query.source} />;
}
