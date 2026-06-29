import { AdminGate } from "@/components/admin-gate";
import { AutoGalleryForm } from "@/components/auto-gallery-form";

export const dynamic = "force-dynamic";

export default function AutoGalleryPage() {
  return (
    <AdminGate>
      <AutoGalleryForm />
    </AdminGate>
  );
}
