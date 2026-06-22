"use client";

import { FormEvent, useState } from "react";

const MAX_MANUAL_UPLOAD_BYTES = 3.4 * 1024 * 1024;

async function optimizeManualPhoto(file: File, targetBytes: number) {
  if (file.size <= targetBytes && file.type === "image/jpeg") return file;

  const bitmap = await createImageBitmap(file);
  const maxSide = 1400;
  const initialScale = Math.min(
    1,
    maxSide / Math.max(bitmap.width, bitmap.height),
  );
  let lastBlob: Blob | null = null;

  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const dimensionScale = initialScale * Math.pow(0.88, Math.floor(attempt / 2));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(480, Math.round(bitmap.width * dimensionScale));
      canvas.height = Math.max(480, Math.round(bitmap.height * dimensionScale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível preparar as fotos.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const quality = Math.max(0.58, 0.88 - attempt * 0.05);
      lastBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );

      if (lastBlob && lastBlob.size <= targetBytes) break;
    }
  } finally {
    bitmap.close();
  }

  if (!lastBlob) throw new Error("Não foi possível preparar as fotos.");
  return new File([lastBlob], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
  });
}

export function ManualGalleryForm() {
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Criando galeria...");
  const [error, setError] = useState("");
  const [galleryUrl, setGalleryUrl] = useState("");

  async function createGallery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setLoading(true);
    setLoadingLabel("Preparando fotos...");
    setError("");
    setGalleryUrl("");

    try {
      const files = formData
        .getAll("photos")
        .filter((entry): entry is File => entry instanceof File && entry.size > 0);
      const targetBytes = Math.min(
        800 * 1024,
        Math.floor(MAX_MANUAL_UPLOAD_BYTES / Math.max(1, files.length)),
      );
      formData.delete("photos");

      for (const [index, file] of files.entries()) {
        setLoadingLabel(`Preparando foto ${index + 1} de ${files.length}...`);
        formData.append("photos", await optimizeManualPhoto(file, targetBytes));
      }

      setLoadingLabel("Enviando galeria...");
      const response = await fetch("/api/manual-gallery", {
        method: "POST",
        body: formData,
      });
      const rawResponse = await response.text();
      let result: {
        ok?: boolean;
        error?: string;
        galleryUrl?: string;
      } = {};

      try {
        result = JSON.parse(rawResponse) as typeof result;
      } catch {
        throw new Error(
          response.status === 413 || rawResponse.includes("Request Entity Too Large")
            ? "As fotos ainda ficaram grandes demais. Tente enviar menos imagens por vez."
            : `O servidor respondeu de forma inesperada (HTTP ${response.status}).`,
        );
      }

      if (!response.ok || !result.ok || !result.galleryUrl) {
        throw new Error(result.error ?? "Não foi possível criar a galeria.");
      }

      setGalleryUrl(result.galleryUrl);
      form.reset();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível criar a galeria.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyGalleryUrl() {
    if (!galleryUrl) return;
    await navigator.clipboard.writeText(galleryUrl);
  }

  return (
    <main className="manual-page">
      <section className="manual-panel">
        <span className="section-kicker">MODO MANUAL</span>
        <h1>Criar galeria com fotos prontas</h1>
        <p>
          Suba as imagens finais, configure a oferta e gere uma galeria com
          marca d&apos;água, seleção, Pix e liberação automática.
        </p>
        <a className="manual-list-link" href="/manual/galerias">
          Ver galerias manuais criadas
        </a>

        <form className="manual-form" onSubmit={createGallery}>
          <div className="manual-grid">
            <label>
              Nome do cliente
              <input name="customerName" placeholder="Ex: Maria Silva" required />
            </label>
            <label>
              Telefone
              <input
                inputMode="tel"
                name="phone"
                placeholder="Ex: 32991997096"
                required
              />
            </label>
          </div>

          <label>
            Atendente das vendas da galeria
            <select defaultValue="default" name="attendantMode">
              <option value="default">Automático: Galeria + valor da 1ª extra</option>
              <option value="sheila">Sheila</option>
            </select>
            <small>
              O automático ficará como, por exemplo, Galeria 9.90.
            </small>
          </label>

          <div className="manual-grid three">
            <label>
              Entrada já paga
              <input
                defaultValue="7.90"
                min="0"
                name="paidAmount"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label>
              Fotos incluídas
              <input
                defaultValue="1"
                max="20"
                min="0"
                name="includedPhotos"
                required
                step="1"
                type="number"
              />
            </label>
            <label>
              1ª foto extra
              <input
                defaultValue="9.90"
                min="0.01"
                name="firstExtraAmount"
                required
                step="0.01"
                type="number"
              />
            </label>
          </div>

          <label>
            Fotos finais
            <input
              accept="image/*"
              multiple
              name="photos"
              required
              type="file"
            />
            <small>Envie de 1 a 20 imagens. A ordem do upload vira Foto 01, 02...</small>
          </label>

          {error && <p className="form-error">{error}</p>}

          <button className="primary-button" disabled={loading} type="submit">
            {loading ? loadingLabel : "Criar galeria"}
          </button>
        </form>

        {galleryUrl && (
          <div className="manual-result">
            <span>Galeria criada</span>
            <a href={galleryUrl} rel="noreferrer" target="_blank">
              {galleryUrl}
            </a>
            <button
              className="secondary-button"
              onClick={() => void copyGalleryUrl()}
              type="button"
            >
              Copiar link
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
