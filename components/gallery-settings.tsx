"use client";

import { FormEvent, useEffect, useState } from "react";

type Settings = {
  products: { id?: string; name: string; galleryType?: string }[];
  attendants: { id?: string; name: string }[];
};

export function GallerySettings() {
  const [settings, setSettings] = useState<Settings>({
    products: [],
    attendants: [],
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
    setMessage("Salvo.");
    await loadSettings();
  }

  return (
    <main className="manual-page">
      <section className="manual-panel">
        <span className="section-kicker">CONFIGURAÇÕES</span>
        <h1>Produtos e atendentes</h1>
        <p>
          Cadastre os nomes usados nas galerias manuais, automáticas e nas vendas
          reportadas para o BI/planilha.
        </p>

        <label>
          Senha administrativa
          <input
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Senha"
            type="password"
            value={password}
          />
        </label>

        <div className="manual-grid">
          <form className="manual-form compact" onSubmit={(event) => void save(event, "product")}>
            <h2>Novo produto</h2>
            <label>
              Nome do produto
              <input name="name" placeholder="Ex: Galeria IA - Profissional" required />
            </label>
            <label>
              Tipo
              <select name="galleryType" defaultValue="universal">
                <option value="universal">Universal</option>
                <option value="professional">Profissional</option>
              </select>
            </label>
            <button className="primary-button" type="submit">
              Salvar produto
            </button>
          </form>

          <form className="manual-form compact" onSubmit={(event) => void save(event, "attendant")}>
            <h2>Novo atendente</h2>
            <label>
              Nome do atendente
              <input name="name" placeholder="Ex: Galeria Sheila" required />
            </label>
            <button className="primary-button" type="submit">
              Salvar atendente
            </button>
          </form>
        </div>

        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}

        <div className="manual-grid">
          <div className="manual-result">
            <span>Produtos cadastrados</span>
            {settings.products.map((product) => (
              <small key={product.id ?? product.name}>
                {product.name} · {product.galleryType ?? "universal"}
              </small>
            ))}
          </div>
          <div className="manual-result">
            <span>Atendentes cadastrados</span>
            {settings.attendants.map((attendant) => (
              <small key={attendant.id ?? attendant.name}>{attendant.name}</small>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
