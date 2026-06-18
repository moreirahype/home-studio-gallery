const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export async function validatePublicImageUrl(imageUrl: string) {
  if (!URL.canParse(imageUrl)) {
    return { ok: false as const, error: "A foto precisa ser uma URL valida." };
  }

  let response = await fetch(imageUrl, {
    method: "HEAD",
    cache: "no-store",
    redirect: "follow",
  }).catch(() => null);

  if (!response?.ok || !response.headers.get("content-type")) {
    response = await fetch(imageUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      headers: { range: "bytes=0-1023" },
    }).catch(() => null);
  }

  if (!response?.ok) {
    return {
      ok: false as const,
      error: "Não consegui abrir a foto de referência publicamente.",
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return {
      ok: false as const,
      error: `A URL da foto retornou ${contentType || "um arquivo sem tipo de imagem"}.`,
    };
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    return {
      ok: false as const,
      error: "A foto de referência precisa ter no máximo 15 MB.",
    };
  }

  return { ok: true as const, contentType };
}
