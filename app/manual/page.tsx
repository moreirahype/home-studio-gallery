import { AdminGate } from "@/components/admin-gate";
import { ManualGalleryForm } from "@/components/manual-gallery-form";

export const dynamic = "force-dynamic";

export default function ManualGalleryPage() {
  return (
    <AdminGate>
      <ManualGalleryForm />
    </AdminGate>
  );
}
