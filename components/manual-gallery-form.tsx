"use client";

import { FormEvent, useState } from "react";

export function ManualGalleryForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [galleryUrl, setGalleryUrl] = useState("");

  async function createGallery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setLoading(true);
    setError("");
    setGalleryUrl("");

    try {
      const response = await fetch("/api/manual-gallery", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        galleryUrl?: string;
      };

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
            Contexto do ensaio
            <input
              defaultValue="Galeria manual"
              name="contextFinal"
              placeholder="Ex: aniversário, profissional, gestante..."
            />
          </label>

          <div className="manual-grid three">
            <label>
              Entrada já paga
              <input
                defaultValue="7.90"
                min="0.01"
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
                min="1"
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
            {loading ? "Criando galeria..." : "Criar galeria"}
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
