import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { safeCompare } from "@/lib/security";

export const GALLERY_ADMIN_COOKIE = "hs_gallery_admin";

export function getGalleryAdminPassword() {
  return process.env.GALLERY_ADMIN_PASSWORD ?? process.env.MANUAL_GALLERY_PASSWORD;
}

export function createGalleryAdminSessionToken() {
  const password = getGalleryAdminPassword();
  if (!password) return null;
  return createHmac("sha256", password)
    .update("home-studio-gallery-admin-session-v1")
    .digest("hex");
}

export function isGalleryAdminRequest(request: NextRequest) {
  return safeCompare(
    request.cookies.get(GALLERY_ADMIN_COOKIE)?.value ?? null,
    createGalleryAdminSessionToken() ?? undefined,
  );
}
