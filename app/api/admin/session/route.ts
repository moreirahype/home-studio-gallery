import { NextRequest, NextResponse } from "next/server";
import {
  createGalleryAdminSessionToken,
  GALLERY_ADMIN_COOKIE,
  getGalleryAdminPassword,
  isGalleryAdminRequest,
} from "@/lib/admin-session";
import { safeCompare } from "@/lib/security";

export async function GET(request: NextRequest) {
  return NextResponse.json({ ok: true, authenticated: isGalleryAdminRequest(request) });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  if (!safeCompare(body.password ?? null, getGalleryAdminPassword())) {
    return NextResponse.json(
      { ok: false, error: "Senha administrativa inválida." },
      { status: 403 },
    );
  }

  const token = createGalleryAdminSessionToken();
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "GALLERY_ADMIN_PASSWORD não configurada." },
      { status: 500 },
    );
  }

  const response = NextResponse.json({ ok: true, authenticated: true });
  response.cookies.set(GALLERY_ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(GALLERY_ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
