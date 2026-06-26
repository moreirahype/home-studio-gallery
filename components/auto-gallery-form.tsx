"use client";

import {
  ClipboardEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  readClipboardImageFiles,
  readDroppedImageFiles,
  setInputFiles,
} from "@/components/image-upload-helpers";
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
  if (!context) throw new Error("Não foi possível preparar a foto.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.86),
  );
  if (!blob) throw new Error("Não foi possível reduzir a foto.");
  return new File([blob], "referencia.jpg", { type: "image/jpeg" });
}

export function AutoGalleryForm() {
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [firstExtraAmount, setFirstExtraAmount] = useState("7.90");
  const [galleryType, setGalleryType] = useState("universal");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceLabel, setReferenceLabel] = useState(
    "Nenhuma foto selecionada",
  );
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Criando galeria...");
  const [error, setError] = useState("");
  const [galleryUrl, setGalleryUrl] = useState("");
  const [tasks, setTasks] = useState<number | null>(null);
  const [products, setProducts] = useState<
    { name: string; galleryType?: string }[]
  >([]);
  const [attendants, setAttendants] = useState<{ name: string }[]>([]);

  useEffect(() => {
    fetch("/api/gallery-settings", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { products?: typeof products; attendants?: typeof attendants }) => {
        setProducts(result.products ?? []);
        setAttendants(result.attendants ?? []);
      })
      .catch(() => undefined);
  }, []);

  async function createGallery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const reference = referenceFile ?? formData.get("reference");

    setLoading(true);
    setLoadingLabel("Preparando referência...");
    setError("");
    setGalleryUrl("");
    setTasks(null);

    try {
      if (!(reference instanceof File) || !reference.size) {
        throw new Error("Selecione uma foto de referência.");
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
        throw new Error(result.error ?? "Não foi possível criar a galeria.");
      }

      setGalleryUrl(result.galleryUrl);
      setTasks(result.generationTasks ?? null);
      form.reset();
      setReference(null);
      setFirstExtraAmount("7.90");
      setGalleryType("universal");
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

  function setReference(file: File | null) {
    setReferenceFile(file);
    setReferenceLabel(file?.name ?? "Nenhuma foto selecionada");
    setInputFiles(referenceInputRef.current, file ? [file] : []);
  }

  async function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    const [file] = await readDroppedImageFiles(event.dataTransfer, 1);
    if (file) setReference(file);
  }

  function handlePaste(event: ClipboardEvent<HTMLLabelElement>) {
    const [file] = readClipboardImageFiles(event.clipboardData, 1);
    if (!file) return;

    event.preventDefault();
    setReference(file);
  }

  return (
    <main className="manual-page">
      <section className="manual-panel">
        <span className="section-kicker">GERAÇÃO AUTOMÁTICA</span>
        <h1>Criar galeria gerando as fotos</h1>
        <p>
          Use esta página quando quiser criar uma galeria direto por aqui:
          envie a referência, descreva o ensaio e a IA já começa a gerar.
        </p>
        <div className="manual-page-actions">
          <a className="manual-action-link primary" href="/manual/galerias">
            Ver todas as galerias criadas
          </a>
          <a className="manual-action-link" href="/manual">
            Criar galeria com fotos prontas
          </a>
        </div>

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

          <label
            className={`manual-upload-label ${dragActive ? "drag-active" : ""} ${
              referenceFile ? "has-files" : ""
            }`}
            onDragLeave={() => setDragActive(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDrop={(event) => void handleDrop(event)}
            onPaste={handlePaste}
            tabIndex={0}
          >
            <span>Foto de referência</span>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="manual-file-input"
              name="reference"
              onChange={(event) => {
                setReference(event.currentTarget.files?.[0] ?? null);
              }}
              ref={referenceInputRef}
              type="file"
            />
            <span className="manual-upload-box">
              <span className="manual-upload-icon">
                {referenceFile ? "✓" : "+"}
              </span>
              <span className="manual-upload-copy">
                <strong>
                  {referenceFile
                    ? "Foto de referência anexada"
                    : "Selecionar, colar ou arrastar foto"}
                </strong>
                <small>Use uma imagem nítida e com o rosto bem visível.</small>
              </span>
              <span className="manual-upload-cta">Escolher foto</span>
            </span>
            <small>{referenceLabel}</small>
          </label>

          <label className="text-field">
            Descrição do ensaio
            <textarea
              name="contextFinal"
              placeholder="Ex: ensaio de aniversário de 40 anos com balões dourados, confetes, bolo e vestido vermelho"
              required
              rows={4}
            />
          </label>

          <div className="manual-grid">
            <label>
              Tipo de galeria
              <select
                name="galleryType"
                onChange={(event) => setGalleryType(event.target.value)}
                value={galleryType}
              >
                <option value="universal">Universal</option>
                <option value="professional">Profissional</option>
              </select>
            </label>
            <label>
              Produto
              <select
                defaultValue={
                  galleryType === "professional"
                    ? "Galeria IA - Profissional"
                    : "Sem produto"
                }
                key={`product-${galleryType}`}
                name="produto"
              >
                {(products.length
                  ? products
                  : [
                      { name: "Sem produto", galleryType: "universal" },
                      {
                        name: "Galeria IA - Profissional",
                        galleryType: "professional",
                      },
                    ]
                )
                  .filter(
                    (product) =>
                      !product.galleryType || product.galleryType === galleryType,
                  )
                  .map((product) => (
                    <option key={product.name} value={product.name}>
                      {product.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label>
            Atendente das vendas da galeria
            <select defaultValue="default" name="attendantMode">
              {(attendants.length
                ? attendants
                : [{ name: "Galeria" }, { name: "Galeria Sheila" }]
              ).map((attendant) => (
                <option
                  key={attendant.name}
                  value={attendant.name === "Galeria Sheila" ? "sheila" : "default"}
                >
                  {attendant.name}
                </option>
              ))}
            </select>
            <small>Esse nome vai para o dashboard e para a planilha.</small>
          </label>

          <div className="manual-grid three">
            <label>
              Entrada já paga
              <input
                defaultValue={galleryType === "professional" ? "29.90" : "7.90"}
                key={`paid-${galleryType}`}
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
                defaultValue={galleryType === "professional" ? "3" : "1"}
                key={`included-${galleryType}`}
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
                defaultValue={galleryType === "professional" ? "10" : "15"}
                key={`count-${galleryType}`}
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
            1ª foto extra
            <input
              min="0.01"
              name="firstExtraAmount"
              onChange={(event) => setFirstExtraAmount(event.target.value)}
              required
              step="0.01"
              type="number"
              value={firstExtraAmount}
            />
          </label>

          <div className="manual-grid two">
            <label>
              VÃ­deo por foto
              <input
                defaultValue={galleryType === "professional" ? "9.90" : "19.90"}
                key={`video-${galleryType}`}
                min="0"
                name="videoPrice"
                step="0.01"
                type="number"
              />
            </label>
            <label>
              Pack Primeira ImpressÃ£o por foto
              <input
                defaultValue="14.90"
                min="0"
                name="firstImpressionPackPrice"
                step="0.01"
                type="number"
              />
            </label>
          </div>

          <label>
            Senha
            <input
              name="password"
              placeholder="Senha de criação"
              required
              type="password"
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button className="primary-button" disabled={loading} type="submit">
            {loading ? loadingLabel : "Gerar fotos e criar galeria"}
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
                ? "Geração iniciada."
                : `${tasks} fotos enviadas para geração.`}
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
