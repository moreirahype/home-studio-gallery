"use client";

import { FormEvent, useEffect, useState } from "react";

type ManualGallery = {
  id: string;
  customerName: string | null;
  phone: string | null;
  contextFinal: string | null;
  paidAmount: number;
  includedPhotos: number;
  generationCount: number;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  galleryUrl: string;
};

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function ManualGalleryList() {
  const [search, setSearch] = useState("");
  const [galleries, setGalleries] = useState<ManualGallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function loadGalleries(query = search) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/manual-gallery?q=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        galleries?: ManualGallery[];
      };

      if (!response.ok || !result.ok || !result.galleries) {
        throw new Error(result.error ?? "Não foi possível carregar as galerias.");
      }

      setGalleries(result.galleries);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar as galerias.",
      );
    } finally {
      setLoading(false);
    }
  }

  function searchGalleries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadGalleries(search);
  }

  async function copyLink(gallery: ManualGallery) {
    await navigator.clipboard.writeText(gallery.galleryUrl);
    setCopiedId(gallery.id);
    window.setTimeout(() => setCopiedId(null), 2200);
  }

  useEffect(() => {
    void loadGalleries("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="manual-page">
      <section className="manual-panel manual-list-panel">
        <span className="section-kicker">GALERIAS MANUAIS</span>
        <h1>Links criados manualmente</h1>
        <p>
          Consulte por nome ou telefone, copie o link do cliente e acompanhe a
          expiração de 7 dias.
        </p>
        <a className="manual-list-link" href="/manual">
          Criar nova galeria manual
        </a>

        <form className="manual-search" onSubmit={searchGalleries}>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou telefone"
            value={search}
          />
          <button className="primary-button" disabled={loading} type="submit">
            Buscar
          </button>
        </form>

        {error && <p className="form-error">{error}</p>}
        {loading && <p className="manual-empty">Carregando galerias...</p>}
        {!loading && !galleries.length && (
          <p className="manual-empty">Nenhuma galeria manual encontrada.</p>
        )}

        <div className="manual-gallery-list">
          {galleries.map((gallery) => (
            <article
              className={`manual-gallery-card ${gallery.expired ? "expired" : ""}`}
              key={gallery.id}
            >
              <div>
                <span>{gallery.expired ? "Expirada" : "Ativa"}</span>
                <h2>{gallery.customerName}</h2>
                <p>{gallery.phone}</p>
              </div>
              <dl>
                <div>
                  <dt>Fotos</dt>
                  <dd>
                    {gallery.generationCount} geradas ·{" "}
                    {gallery.includedPhotos} incluída
                  </dd>
                </div>
                <div>
                  <dt>Entrada</dt>
                  <dd>{money.format(gallery.paidAmount)}</dd>
                </div>
                <div>
                  <dt>Expira</dt>
                  <dd>{dateTime.format(new Date(gallery.expiresAt))}</dd>
                </div>
              </dl>
              <p>{gallery.contextFinal}</p>
              <div className="manual-card-actions">
                <a
                  className="secondary-button"
                  href={gallery.galleryUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Abrir
                </a>
                <button
                  className="secondary-button"
                  onClick={() => void copyLink(gallery)}
                  type="button"
                >
                  {copiedId === gallery.id ? "Copiado" : "Copiar link"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
