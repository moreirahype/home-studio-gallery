import { NextResponse } from "next/server";

export function unauthorized(message = "Webhook não autorizado.") {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

export function serverError(message = "Não foi possível processar a solicitação.") {
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
