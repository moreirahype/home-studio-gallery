"use client";

import { FormEvent, useState } from "react";

import { formatBrazilianMobile } from "@/lib/phone";

async function optimizeReference(file: File) {
  if (file.size <= 2.5 * 1024 * 1024) return file;

  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Nao foi possivel preparar a foto.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.86),
  );
  if (!blob) throw new Error("Nao foi possivel reduzir a foto.");
  return new File([blob], "referencia.jpg", { type: "image/jpeg" });
}

export function AutoGalleryForm() {
  const [referenceLabel, setReferenceLabel] = useState("Nenhuma foto selecionada");
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Criando galeria...");
  const [error, setError] = useState("");
  const [galleryUrl, setGalleryUrl] = useState("");
  const [tasks, setTasks] = useState<number | null>(null);

  async function createGallery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const reference = formData.get("reference");

    setLoading(true);
    setLoadingLabel("Preparando referencia...");
    setError("");
    setGalleryUrl("");
    setTasks(null);

    try {
      if (!(reference instanceof File) || !reference.size) {
        throw new Error("Selecione uma foto de referencia.");
      }

      formData.set("reference", await optimizeReference(reference));
      setLoadingLabel("Criando galeria e iniciando IA...");

      const response = await fetch("/api/auto-gallery", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        galleryUrl?: string;
        generationTasks?: number;
      };

      if (!response.ok || !result.ok || !result.galleryUrl) {
        throw new Error(result.error ?? "Nao foi possivel criar a galeria.");
      }

      setGalleryUrl(result.galleryUrl);
      setTasks(result.generationTasks ?? null);
      form.reset();
      setReferenceLabel("Nenhuma foto selecionada");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Nao foi possivel criar a galeria.",
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
        <span className="section-kicker">GERACAO AUTOMATICA</span>
        <h1>Criar galeria gerando as fotos</h1>
        <p>
          Use esta pagina quando quiser criar uma galeria direto por aqui:
          envie a referencia, descreva o ensaio e a IA ja comeca a gerar.
        </p>
        <a className="manual-list-link" href="/manual">
          Criar galeria com fotos prontas
        </a>

        <form className="manual-form" onSubmit={createGallery}>
          <label>
            Senha
            <input
              name="password"
              placeholder="Senha de criacao"
              required
              type="password"
            />
          </label>

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
                onBlur={(event) => {
                  event.currentTarget.value = formatBrazilianMobile(
                    event.currentTarget.value,
                  );
                }}
                placeholder="Ex: (32) 99199-7096"
                required
              />
            </label>
          </div>

          <label className="manual-upload-label">
            <span>Foto de referencia</span>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="manual-file-input"
              name="reference"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                setReferenceLabel(file?.name ?? "Nenhuma foto selecionada");
              }}
              type="file"
            />
            <span className="manual-upload-box">
              <span className="manual-upload-icon">+</span>
              <span className="manual-upload-copy">
                <strong>Selecionar foto do cliente</strong>
                <small>Use uma imagem nitida e com o rosto bem visivel.</small>
              </span>
              <span className="manual-upload-cta">Escolher foto</span>
            </span>
            <small>{referenceLabel}</small>
          </label>

          <label className="text-field">
            Descricao do ensaio
            <textarea
              name="contextFinal"
              placeholder="Ex: ensaio de aniversario de 40 anos com baloes dourados, confetes, bolo e vestido vermelho"
              required
              rows={4}
            />
          </label>

          <label>
            Atendente das vendas da galeria
            <select defaultValue="auto" name="attendantMode">
              <option value="auto">Galeria + valor da 1a extra</option>
              <option value="sheila">Sheila + valor da 1a extra</option>
            </select>
          </label>

          <div className="manual-grid three">
            <label>
              Entrada ja paga
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
              Fotos incluidas
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
              Fotos a gerar
              <input
                defaultValue="15"
                max="20"
                min="1"
                name="generationCount"
                required
                step="1"
                type="number"
              />
            </label>
          </div>

          <label>
            1a foto extra
            <input
              defaultValue="7.90"
              min="0.01"
              name="firstExtraAmount"
              required
              step="0.01"
              type="number"
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button className="primary-button" disabled={loading} type="submit">
            {loading ? loadingLabel : "Criar e gerar galeria"}
          </button>
        </form>

        {galleryUrl && (
          <div className="manual-result">
            <span>Galeria criada</span>
            <a href={galleryUrl} rel="noreferrer" target="_blank">
              {galleryUrl}
            </a>
            <small>
              {tasks === null
                ? "Geracao iniciada."
                : `${tasks} fotos enviadas para geracao.`}
            </small>
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
