import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const getProjectByToken = cache(async (galleryToken: string) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, gallery_token, included_photos, paid_amount_cents, generation_count, status, customer_name",
    )
    .eq("gallery_token", galleryToken)
    .maybeSingle();

  if (error?.code === "42703" || error?.message.includes("generation_count")) {
    const fallback = await supabase
      .from("projects")
      .select(
        "id, gallery_token, included_photos, paid_amount_cents, status, customer_name",
      )
      .eq("gallery_token", galleryToken)
      .maybeSingle();

    if (fallback.error) {
      throw new Error(
        `Não foi possível carregar a galeria: ${fallback.error.message}`,
      );
    }

    return fallback.data
      ? { ...fallback.data, generation_count: 15 }
      : fallback.data;
  }

  if (error) {
    throw new Error(`Não foi possível carregar a galeria: ${error.message}`);
  }

  return data;
});
