"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Product = { id?: string; name: string; galleryType?: string };
type Attendant = { id?: string; name: string };

type Settings = {
  products: Product[];
  attendants: Attendant[];
};

function galleryTypeLabel(type?: string) {
  return type === "professional" ? "Profissional" : "Universal";
}

export function GallerySettings() {
  const [settings, setSettings] = useState<Settings>({
    products: [],
    attendants: [],
  });
  const [password, setPassword] = useState("");
  const [deletingProduct, setDeletingProduct] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const productsByType = useMemo(
    () => ({
      universal: settings.products.filter(
        (product) => product.galleryType !== "professional",
      ),
      professional: settings.products.filter(
        (product) => product.galleryType === "professional",
      ),
    }),
    [settings.products],
  );

  async function loadSettings() {
    const response = await fetch("/api/gallery-settings", { cache: "no-store" });
    const result = (await response.json()) as { ok?: boolean } & Settings;
    if (result.ok) {
      setSettings({
        products: result.products ?? [],
        attendants: result.attendants ?? [],
      });
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>, kind: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    setMessage("");

    const response = await fetch("/api/gallery-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password,
        kind,
        name: String(formData.get("name") ?? ""),
        galleryType: String(formData.get("galleryType") ?? "universal"),
      }),
    });
    const result = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) {
      setError(result.error ?? "Não foi possível salvar.");
      return;
    }

    form.reset();
    setMessage(kind === "product" ? "Produto salvo." : "Atendente salvo.");
    await loadSettings();
  }

  async function deleteProduct(product: Product) {
    const identifier = product.id ?? product.name;
    if (!identifier) return;

    const confirmation = window.prompt(
      `Para excluir o produto "${product.name}", digite excluir.`,
    );
    if (confirmation?.trim().toLowerCase() !== "excluir") {
      return;
    }

    setError("");
    setMessage("");
    setDeletingProduct(identifier);

    const response = await fetch("/api/gallery-settings", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password,
        id: product.id,
        name: product.name,
      }),
    });
    const result = (await response.json()) as { ok?: boolean; error?: string };
    setDeletingProduct("");

    if (!response.ok || !result.ok) {
      setError(result.error ?? "Não foi possível excluir o produto.");
      return;
    }

    setMessage("Produto excluído.");
    await loadSettings();
  }

  return (
    <main className="settings-page">
      <section className="settings-hero">
        <div>
          <span className="section-kicker">CONFIGURAÇÕES</span>
          <h1>Produtos e atendentes da galeria</h1>
          <p>
            Organize os nomes que aparecem nos formulários manuais, automáticos,
            no BI e na planilha. Produtos podem ser separados por tipo de galeria.
          </p>
        </div>
        <div className="settings-summary-card">
          <strong>{settings.products.length}</strong>
          <span>produtos ativos</span>
          <small>{settings.attendants.length} atendentes cadastrados</small>
        </div>
      </section>

      <section className="settings-card settings-password-card">
        <label>
          Senha administrativa
          <input
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Digite para salvar ou excluir"
            type="password"
            value={password}
          />
        </label>
        <p>
          A senha é usada só para proteger alterações nesta página. As galerias
          já criadas continuam com os dados que foram salvos nelas.
        </p>
      </section>

      <section className="settings-grid">
        <form
          className="settings-card settings-form"
          onSubmit={(event) => void save(event, "product")}
        >
          <div>
            <span className="settings-card-kicker">Produto</span>
            <h2>Novo produto</h2>
          </div>
          <label>
            Nome do produto
            <input
              name="name"
              placeholder="Ex: Galeria IA - Profissional"
              required
            />
          </label>
          <label>
            Tipo de galeria
            <select name="galleryType" defaultValue="universal">
              <option value="universal">Universal</option>
              <option value="professional">Profissional</option>
            </select>
          </label>
          <button className="primary-button" type="submit">
            Salvar produto
          </button>
        </form>

        <form
          className="settings-card settings-form"
          onSubmit={(event) => void save(event, "attendant")}
        >
          <div>
            <span className="settings-card-kicker">Atendente</span>
            <h2>Novo atendente</h2>
          </div>
          <label>
            Nome do atendente
            <input name="name" placeholder="Ex: Galeria Sheila" required />
          </label>
          <button className="primary-button" type="submit">
            Salvar atendente
          </button>
        </form>
      </section>

      {error && <p className="form-error settings-feedback">{error}</p>}
      {message && <p className="form-success settings-feedback">{message}</p>}

      <section className="settings-grid settings-lists">
        <div className="settings-card">
          <div className="settings-list-header">
            <div>
              <span className="settings-card-kicker">Produtos</span>
              <h2>Cadastrados</h2>
            </div>
          </div>

          {(["universal", "professional"] as const).map((type) => {
            const products = productsByType[type];
            return (
              <div className="settings-product-group" key={type}>
                <span>{galleryTypeLabel(type)}</span>
                {products.length ? (
                  products.map((product) => (
                    <div
                      className="settings-list-item"
                      key={product.id ?? product.name}
                    >
                      <div>
                        <strong>{product.name}</strong>
                        <small>{galleryTypeLabel(product.galleryType)}</small>
                      </div>
                      <button
                        className="settings-delete-button"
                        disabled={
                          deletingProduct === (product.id ?? product.name)
                        }
                        onClick={() => void deleteProduct(product)}
                        type="button"
                      >
                        {deletingProduct === (product.id ?? product.name)
                          ? "Excluindo..."
                          : "Excluir"}
                      </button>
                    </div>
                  ))
                ) : (
                  <small className="settings-empty">Nenhum produto ativo.</small>
                )}
              </div>
            );
          })}
        </div>

        <div className="settings-card">
          <div className="settings-list-header">
            <div>
              <span className="settings-card-kicker">Atendentes</span>
              <h2>Cadastrados</h2>
            </div>
          </div>
          <div className="settings-attendant-list">
            {settings.attendants.map((attendant) => (
              <span key={attendant.id ?? attendant.name}>{attendant.name}</span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
