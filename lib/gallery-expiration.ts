export const GALLERY_RETENTION_DAYS = 7;

export function galleryExpiresAt(createdAt?: string | null, expiresAt?: string | null) {
  if (expiresAt) return new Date(expiresAt);
  const base = createdAt ? new Date(createdAt) : new Date();
  base.setDate(base.getDate() + GALLERY_RETENTION_DAYS);
  return base;
}

export function isGalleryExpired(createdAt?: string | null, expiresAt?: string | null) {
  return galleryExpiresAt(createdAt, expiresAt).getTime() < Date.now();
}

