import { NextRequest, NextResponse } from "next/server";
import { safeCompare } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const DEFAULT_PRODUCTS = [
  { name: "Sem produto", galleryType: "universal" },
  { name: "Galeria IA - Profissional", galleryType: "professional" },
];
const DEFAULT_ATTENDANTS = ["Galeria", "Galeria Sheila"];

function getAdminPassword() {
  return process.env.GALLERY_ADMIN_PASSWORD ?? process.env.MANUAL_GALLERY_PASSWORD;
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  const [products, attendants] = await Promise.all([
    supabase
      .from("gallery_products")
      .select("id, name, gallery_type, active")
      .eq("active", true)
      .order("name"),
    supabase
      .from("gallery_attendants")
      .select("id, name, active")
      .eq("active", true)
      .order("name"),
  ]);

  return NextResponse.json({
    ok: true,
    products:
      products.error
        ? DEFAULT_PRODUCTS
        : (products.data ?? []).map((product) => ({
            id: product.id,
            name: product.name,
            galleryType: product.gallery_type,
          })),
    attendants:
      attendants.error
        ? DEFAULT_ATTENDANTS.map((name) => ({ name }))
        : attendants.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    password?: string;
    kind?: string;
    name?: string;
    galleryType?: string;
  };

  if (!safeCompare(body.password ?? null, getAdminPassword())) {
    return NextResponse.json(
      { ok: false, error: "Senha inválida." },
      { status: 403 },
    );
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json(
      { ok: false, error: "Informe um nome." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (body.kind === "product") {
    const { error } = await supabase.from("gallery_products").upsert(
      {
        name,
        gallery_type:
          body.galleryType === "professional" ? "professional" : "universal",
        active: true,
      },
      { onConflict: "name" },
    );
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  } else if (body.kind === "attendant") {
    const { error } = await supabase.from("gallery_attendants").upsert(
      { name, active: true },
      { onConflict: "name" },
    );
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  } else {
    return NextResponse.json(
      { ok: false, error: "Tipo inválido." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json()) as {
    password?: string;
    id?: string;
    name?: string;
  };

  if (!safeCompare(body.password ?? null, getAdminPassword())) {
    return NextResponse.json(
      { ok: false, error: "Senha inválida." },
      { status: 403 },
    );
  }

  const id = body.id?.trim();
  const name = body.name?.trim();
  if (!id && !name) {
    return NextResponse.json(
      { ok: false, error: "Produto não informado." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const query = supabase.from("gallery_products").update({ active: false });
  const { error } = id ? await query.eq("id", id) : await query.eq("name", name);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
