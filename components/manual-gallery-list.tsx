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
    void loadGalleries("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      </section>
    </main>
  );
}
