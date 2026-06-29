import { AdminGate } from "@/components/admin-gate";
import { ManualGalleryList } from "@/components/manual-gallery-list";

export const dynamic = "force-dynamic";

export default function ManualGalleryListPage() {
  return (
    <AdminGate>
      <ManualGalleryList />
    </AdminGate>
  );
}
