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
  const photosInputRef = useRef<HTMLInputElement>(null);
  const [firstExtraAmount, setFirstExtraAmount] = useState("7.90");
  const [galleryType, setGalleryType] = useState("universal");
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [selectedPhotosLabel, setSelectedPhotosLabel] = useState(
    "Nenhuma foto selecionada",
  );
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Criando galeria...");
  const [error, setError] = useState("");
  const [galleryUrl, setGalleryUrl] = useState("");
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

  useEffect(() => {
    setFirstExtraAmount(galleryType === "professional" ? "9.90" : "7.90");
  }, [galleryType]);

  async function createGallery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setLoading(true);
    setLoadingLabel("Preparando fotos...");
    setError("");
    setGalleryUrl("");

    try {
      const files = selectedPhotos.length
        ? selectedPhotos
        : formData
            .getAll("photos")
            .filter((entry): entry is File => entry instanceof File && entry.size > 0);

      if (!files.length) {
        throw new Error("Selecione pelo menos uma foto para criar a galeria.");
      }

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
      setSelectedPhotos([]);
      setSelectedPhotosLabel("Nenhuma foto selecionada");
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

  function setPhotos(files: File[]) {
    const selectedFiles = files.slice(0, 20);
    setSelectedPhotos(selectedFiles);
    setInputFiles(photosInputRef.current, selectedFiles);
    if (!selectedFiles.length) {
      setSelectedPhotosLabel("Nenhuma foto selecionada");
      return;
    }

    const previewNames = selectedFiles
      .slice(0, 3)
      .map((file) => file.name)
      .join(", ");
    const remainingCount = selectedFiles.length - 3;
    setSelectedPhotosLabel(
      remainingCount > 0
        ? `${selectedFiles.length} fotos selecionadas: ${previewNames} +${remainingCount}`
        : `${selectedFiles.length} foto${
            selectedFiles.length > 1 ? "s" : ""
          } selecionada${selectedFiles.length > 1 ? "s" : ""}: ${previewNames}`,
    );
  }

  function updateSelectedPhotosLabel(files: FileList | null) {
    setPhotos(Array.from(files ?? []));
  }

  async function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    const droppedFiles = await readDroppedImageFiles(event.dataTransfer, 20);
    if (droppedFiles.length) setPhotos([...selectedPhotos, ...droppedFiles]);
  }

  function handlePaste(event: ClipboardEvent<HTMLLabelElement>) {
    const pastedFiles = readClipboardImageFiles(
      event.clipboardData,
      20 - selectedPhotos.length,
    );
    if (!pastedFiles.length) return;

    event.preventDefault();
    setPhotos([...selectedPhotos, ...pastedFiles]);
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
        <div className="manual-page-actions">
          <a className="manual-action-link primary" href="/manual/galerias">
            Ver todas as galerias criadas
          </a>
          <a className="manual-action-link" href="/automatico">
            Criar galeria gerando com IA
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

          <section className="manual-config-section">
            <header className="manual-config-heading">
              <strong>Configuração da oferta</strong>
              <small>Defina o que o cliente recebe e o valor das fotos extras.</small>
            </header>
            <div className="manual-grid four">
              <label>
                Entrada já paga
                <input
                  defaultValue="29.90"
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
                  defaultValue="3"
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
                Fotos na galeria
                <input
                  defaultValue="10"
                  key={`count-${galleryType}`}
                  max="20"
                  min="1"
                  name="generationCount"
                  required
                  step="1"
                  type="number"
                />
              </label>
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
            </div>
          </section>

          <section className="manual-config-section">
            <header className="manual-config-heading">
              <strong>Valores dos extras</strong>
              <small>Configure os adicionais oferecidos antes do pagamento.</small>
            </header>
            <div className="manual-grid two manual-addon-price-grid">
              <label className="manual-price-field">
                <span className="manual-field-heading">
                  <strong>Vídeo por foto</strong>
                  <small>Cobrado por cada foto transformada em vídeo.</small>
                </span>
                <input
                  defaultValue={galleryType === "professional" ? "9.90" : "19.90"}
                  key={`video-${galleryType}`}
                  min="0"
                  name="videoPrice"
                  step="0.01"
                  type="number"
                />
              </label>
              <label className="manual-price-field">
                <span className="manual-field-heading">
                  <strong>Pack Primeira Impressão por foto</strong>
                  <small>
                    {galleryType === "professional"
                      ? "Gera +3 versões extras para cada foto escolhida."
                      : "O Pack só aparece nas galerias profissionais."}
                  </small>
                </span>
                <input
                  defaultValue="14.90"
                  disabled={galleryType !== "professional"}
                  min="0"
                  name="firstImpressionPackPrice"
                  placeholder={
                    galleryType === "professional"
                      ? "14.90"
                      : "Disponível apenas no profissional"
                  }
                  step="0.01"
                  type="number"
                />
              </label>
            </div>
          </section>

          <label
            className={`manual-upload-label ${dragActive ? "drag-active" : ""} ${
              selectedPhotos.length ? "has-files" : ""
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
            <span>Fotos finais</span>
            <input
              accept="image/*"
              className="manual-file-input"
              multiple
              name="photos"
              onChange={(event) =>
                updateSelectedPhotosLabel(event.currentTarget.files)
              }
              ref={photosInputRef}
              type="file"
            />
            <span className="manual-upload-box">
              <span className="manual-upload-icon">
                {selectedPhotos.length ? "✓" : "+"}
              </span>
              <span className="manual-upload-copy">
                <strong>
                  {selectedPhotos.length
                    ? `${selectedPhotos.length} fotos anexadas`
                    : "Selecionar, colar ou arrastar fotos"}
                </strong>
                <small>
                  Clique, cole com Ctrl+V ou arraste imagens direto para este
                  bloco.
                </small>
              </span>
              <span className="manual-upload-cta">Escolher arquivos</span>
            </span>
            <small>{selectedPhotosLabel}</small>
            <small>
              Envie de 1 a 20 imagens. A ordem do upload vira Foto 01, 02...
            </small>
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
