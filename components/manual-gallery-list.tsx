"use client";

import { FormEvent, useEffect, useState } from "react";

import { formatBrazilianMobile } from "@/lib/phone";

type ManualGallery = {
  id: string;
  kind: "manual" | "automatic";
  customerName: string | null;
  phone: string | null;
  paidAmount: number;
  includedPhotos: number;
  generationCount: number;
  attendantName: string | null;
  productName: string | null;
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  async function loadGalleries(query = search, pageNumber = page) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/manual-gallery?q=${encodeURIComponent(query)}&page=${pageNumber}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        galleries?: ManualGallery[];
        page?: number;
        total?: number;
        totalPages?: number;
      };

      if (!response.ok || !result.ok || !result.galleries) {
        throw new Error(result.error ?? "Não foi possível carregar as galerias.");
      }

      setGalleries(result.galleries);
      setPage(result.page ?? pageNumber);
      setTotal(result.total ?? result.galleries.length);
      setTotalPages(result.totalPages ?? 1);
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
    setPage(1);
    void loadGalleries(search, 1);
  }

  async function copyLink(gallery: ManualGallery) {
    await navigator.clipboard.writeText(gallery.galleryUrl);
    setCopiedId(gallery.id);
    window.setTimeout(() => setCopiedId(null), 2200);
  }

  async function deleteGallery(gallery: ManualGallery) {
    const confirmation = window.prompt(
      `Para excluir definitivamente a galeria de ${gallery.customerName}, digite excluir:`,
    );
    if (confirmation?.trim().toLowerCase() !== "excluir") return;

    setDeletingId(gallery.id);
    setError("");

    try {
      const response = await fetch("/api/manual-gallery", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: gallery.id,
          confirmation,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Não foi possível excluir a galeria.");
      }

      setGalleries((current) =>
        current.filter((item) => item.id !== gallery.id),
      );
      setTotal((current) => Math.max(0, current - 1));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível excluir a galeria.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  function beginEdit(gallery: ManualGallery) {
    setEditingId(gallery.id);
    setEditName(gallery.customerName ?? "");
    setEditPhone(gallery.phone ?? "");
    setError("");
  }

  async function saveEdit(gallery: ManualGallery) {
    setSavingId(gallery.id);
    setError("");

    try {
      const response = await fetch("/api/manual-gallery", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: gallery.id,
          customerName: editName,
          phone: editPhone,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        customerName?: string;
        phone?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Não foi possível salvar os dados.");
      }

      setGalleries((current) =>
        current.map((item) =>
          item.id === gallery.id
            ? {
                ...item,
                customerName: result.customerName ?? editName.trim(),
                phone: result.phone ?? editPhone.replace(/\D/g, ""),
              }
            : item,
        ),
      );
      setEditingId(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar os dados.",
      );
    } finally {
      setSavingId(null);
    }
  }

  useEffect(() => {
    void loadGalleries("", 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToPage(nextPage: number) {
    const safePage = Math.min(totalPages, Math.max(1, nextPage));
    setPage(safePage);
    void loadGalleries(search, safePage);
  }

  return (
    <main className="manual-page">
      <section className="manual-panel manual-list-panel">
        <span className="section-kicker">GALERIAS CRIADAS</span>
        <h1>Links manuais e automáticos</h1>
        <p>
          Consulte por nome ou telefone, copie o link do cliente e acompanhe a
          expiração de 7 dias.
        </p>
        <div className="manual-page-actions">
          <a className="manual-action-link" href="/manual">
            Criar com fotos prontas
          </a>
          <a className="manual-action-link" href="/automatico">
            Criar gerando com IA
          </a>
        </div>

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
          <p className="manual-empty">Nenhuma galeria encontrada.</p>
        )}

        {!loading && galleries.length > 0 && (
          <div className="manual-pagination-summary">
            <span>
              Mostrando página {page} de {totalPages}
            </span>
            <small>{total} galerias encontradas</small>
          </div>
        )}

        <div className="manual-gallery-list">
          {galleries.map((gallery) => (
            <article
              className={`manual-gallery-card ${gallery.expired ? "expired" : ""}`}
              key={gallery.id}
            >
              <div>
                <div className="manual-card-tags">
                  <span>{gallery.expired ? "Expirada" : "Ativa"}</span>
                  <span>
                    {gallery.kind === "automatic" ? "Automática" : "Manual"}
                  </span>
                </div>
                {editingId === gallery.id ? (
                  <div className="manual-edit-fields">
                    <label>
                      Nome
                      <input
                        onChange={(event) => setEditName(event.target.value)}
                        value={editName}
                      />
                    </label>
                    <label>
                      Telefone
                      <input
                        inputMode="tel"
                        onBlur={() =>
                          setEditPhone(formatBrazilianMobile(editPhone))
                        }
                        onChange={(event) => setEditPhone(event.target.value)}
                        value={editPhone}
                      />
                    </label>
                    <div>
                      <button
                        className="primary-button"
                        disabled={savingId === gallery.id}
                        onClick={() => void saveEdit(gallery)}
                        type="button"
                      >
                        {savingId === gallery.id ? "Salvando..." : "Salvar"}
                      </button>
                      <button
                        className="secondary-button"
                        disabled={savingId === gallery.id}
                        onClick={() => setEditingId(null)}
                        type="button"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2>{gallery.customerName}</h2>
                    <p>{gallery.phone}</p>
                  </>
                )}
              </div>
              <dl>
                <div>
                  <dt>Fotos</dt>
                  <dd>
                    {gallery.generationCount} geradas ·{" "}
                    {gallery.includedPhotos === 0
                      ? "nenhuma incluída"
                      : `${gallery.includedPhotos} ${
                          gallery.includedPhotos === 1
                            ? "incluída"
                            : "incluídas"
                        }`}
                  </dd>
                </div>
                <div>
                  <dt>Produto</dt>
                  <dd>{gallery.productName ?? "Sem produto"}</dd>
                </div>
                <div>
                  <dt>Entrada</dt>
                  <dd>{money.format(gallery.paidAmount)}</dd>
                </div>
                <div>
                  <dt>Expira</dt>
                  <dd>{dateTime.format(new Date(gallery.expiresAt))}</dd>
                </div>
                <div>
                  <dt>Atendente</dt>
                  <dd>{gallery.attendantName ?? "Galeria automática"}</dd>
                </div>
              </dl>
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
                <button
                  className="secondary-button"
                  onClick={() => beginEdit(gallery)}
                  type="button"
                >
                  Editar nome e telefone
                </button>
                <button
                  className="danger-button"
                  disabled={deletingId === gallery.id}
                  onClick={() => void deleteGallery(gallery)}
                  type="button"
                >
                  {deletingId === gallery.id ? "Excluindo..." : "Excluir"}
                </button>
              </div>
            </article>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="manual-pagination">
            <button
              className="secondary-button"
              disabled={loading || page <= 1}
              onClick={() => goToPage(page - 1)}
              type="button"
            >
              Página anterior
            </button>
            <div>
              {Array.from({ length: totalPages }, (_, index) => index + 1)
                .filter(
                  (pageNumber) =>
                    pageNumber === 1 ||
                    pageNumber === totalPages ||
                    Math.abs(pageNumber - page) <= 1,
                )
                .map((pageNumber, index, visiblePages) => {
                  const previous = visiblePages[index - 1];
                  return (
                    <span key={pageNumber}>
                      {previous && pageNumber - previous > 1 && (
                        <small>...</small>
                      )}
                      <button
                        className={pageNumber === page ? "active" : ""}
                        disabled={loading}
                        onClick={() => goToPage(pageNumber)}
                        type="button"
                      >
                        {pageNumber}
                      </button>
                    </span>
                  );
                })}
            </div>
            <button
              className="secondary-button"
              disabled={loading || page >= totalPages}
              onClick={() => goToPage(page + 1)}
              type="button"
            >
              Próxima página
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
