"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trackBrowserPurchase } from "@/lib/meta-browser";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const themes = [
  "Profissional",
  "Luxo",
  "Casual",
  "Romântico",
  "Fitness",
  "Aniversário",
];

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

export function NewShootForm({
  sourceToken,
  expressOffer = false,
  offerToken,
  paidAmount = 7.9,
  includedPhotos: configuredIncludedPhotos = 1,
  generationCount = 15,
  firstExtraAmount = 9.9,
}: {
  sourceToken?: string;
  expressOffer?: boolean;
  offerToken?: string;
  paidAmount?: number;
  includedPhotos?: number;
  generationCount?: number;
  firstExtraAmount?: number;
}) {
  const photoCount = expressOffer ? 5 : generationCount;
  const includedPhotos = expressOffer ? 1 : configuredIncludedPhotos;
  const price = expressOffer ? 4.9 : paidAmount;
  const [theme, setTheme] = useState("");
  const [occasion, setOccasion] = useState("");
  const [style, setStyle] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [error, setError] = useState("");
  const [pixPayment, setPixPayment] = useState<{
    orderId: string;
    paymentId: string;
    galleryToken: string;
    galleryUrl: string;
    amount: number;
    qrCode?: string;
    qrCodeBase64?: string;
  } | null>(null);

  const description = useMemo(
    () =>
      [
        theme && `Tema ${theme.toLowerCase()}`,
        occasion && `para ${occasion}`,
        style && `com visual ${style}`,
      ]
        .filter(Boolean)
        .join(", "),
    [occasion, style, theme],
  );

  async function submit() {
    if (!imageFile || !theme) return;
    setSubmitting(true);
    setError("");

    let optimizedImage: File;
    try {
      optimizedImage = await optimizeReference(imageFile);
    } catch {
      setError(
        "Não conseguimos preparar essa foto. Tente uma imagem JPG menor.",
      );
      setSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.set("reference", optimizedImage);
    formData.set("theme", theme);
    formData.set("occasion", occasion);
    formData.set("styleNotes", style);
    formData.set("offer", expressOffer ? "express" : "standard");
    formData.set("paidAmount", price.toFixed(2));
    formData.set("includedPhotos", String(includedPhotos));
    formData.set("generationCount", String(photoCount));
    formData.set("firstExtraAmount", firstExtraAmount.toFixed(2));
    if (offerToken) formData.set("offerToken", offerToken);
    if (sourceToken) formData.set("sourceToken", sourceToken);

    const response = await fetch("/api/repeat-shoots", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json()) as {
      ok: boolean;
      error?: string;
      orderId?: string;
      paymentId?: string;
      galleryToken?: string;
      galleryUrl?: string;
      amount?: number;
      qrCode?: string;
      qrCodeBase64?: string;
    };

    if (!response.ok || !result.ok) {
      setError(result.error ?? "Não foi possível preparar o ensaio.");
      setSubmitting(false);
      return;
    }

    if (
      !result.orderId ||
      !result.paymentId ||
      !result.galleryToken ||
      !result.galleryUrl
    ) {
      setError("O Pix não foi criado corretamente. Tente novamente.");
      setSubmitting(false);
      return;
    }

    setPixPayment({
      orderId: result.orderId,
      paymentId: result.paymentId,
      galleryToken: result.galleryToken,
      galleryUrl: result.galleryUrl,
      amount: result.amount ?? price,
      qrCode: result.qrCode,
      qrCodeBase64: result.qrCodeBase64,
    });
    setSubmitted(true);
    setSubmitting(false);
  }

  async function checkPayment() {
    if (!pixPayment) return;
    setCheckingPayment(true);
    setError("");
    const response = await fetch("/api/checkout/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        galleryToken: pixPayment.galleryToken,
        orderId: pixPayment.orderId,
      }),
    });
    const result = (await response.json()) as {
      ok: boolean;
      paid?: boolean;
      error?: string;
    };
    setCheckingPayment(false);

    if (!response.ok || !result.ok) {
      setError(result.error ?? "Não foi possível conferir o pagamento.");
      return;
    }

    if (!result.paid) {
      setError("Pagamento ainda não encontrado. Aguarde alguns segundos.");
      return;
    }

    trackBrowserPurchase({
      paymentId: pixPayment.paymentId,
      orderId: pixPayment.orderId,
      value: pixPayment.amount,
    });
    window.location.href = pixPayment.galleryUrl;
  }

  async function copyPixCode() {
    if (!pixPayment?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixPayment.qrCode);
      setError("");
      setPixCopied(true);
      window.setTimeout(() => setPixCopied(false), 3500);
    } catch {
      setError(
        "Não foi possível copiar automaticamente. Toque e segure o código Pix para copiar.",
      );
    }
  }

  if (submitted && pixPayment) {
    return (
      <main className="new-shoot-shell">
        <section className="new-shoot-card success-state">
          <span className="modal-badge warning">Pix gerado</span>
          <h1>Falta apenas confirmar o pagamento.</h1>
          <p>
            Pague {money.format(pixPayment.amount)} para iniciar a geração de{" "}
            {photoCount} opções. Você já leva {includedPhotos}{" "}
            {includedPhotos === 1 ? "foto incluída" : "fotos incluídas"}.
          </p>
          {pixPayment.qrCodeBase64 && (
            <img
              alt="QR Code Pix"
              className="pix-qr-image"
              src={`data:image/png;base64,${pixPayment.qrCodeBase64}`}
            />
          )}
          {pixPayment.qrCode && (
            <button
              className={`copy-pix-button ${pixCopied ? "copied" : ""}`}
              onClick={copyPixCode}
              type="button"
            >
              {pixCopied ? "Pix copiado! Abra seu banco" : "Copiar Pix Copia e Cola"}
            </button>
          )}
          <button
            className="primary-button"
            disabled={checkingPayment}
            onClick={checkPayment}
            type="button"
          >
            {checkingPayment ? "Conferindo..." : "Já paguei, iniciar ensaio"}
          </button>
          {error && <p className="form-error">{error}</p>}
          <button
            className="text-button muted"
            onClick={() => setSubmitted(false)}
            type="button"
          >
            Voltar e revisar pedido
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="new-shoot-shell">
      <nav className="gallery-nav">
        <Link className="brand" href="/">
          HOME <span>STUDIO</span>
        </Link>
        <span className="nav-meta">Novo ensaio</span>
      </nav>

      <header className="new-shoot-hero">
        <span className="eyebrow">
          {photoCount} OPÇÕES E {includedPhotos}{" "}
          {includedPhotos === 1 ? "FOTO INCLUÍDA" : "FOTOS INCLUÍDAS"} POR{" "}
          {money.format(price)}
        </span>
        <h1>Como você quer aparecer no seu próximo ensaio?</h1>
        <p>
          Não precisa saber escrever prompt. Conte do seu jeito e nós
          transformamos suas escolhas em uma direção fotográfica profissional.
        </p>
      </header>

      <section className="new-shoot-card">
        <label className="upload-field">
          <span>1. Escolha uma foto sua</span>
          <strong>{imageName || "Enviar foto de referência"}</strong>
          <small>Use uma foto nítida, de frente e com boa iluminação.</small>
          <input
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) =>
              {
                const file = event.target.files?.[0] ?? null;
                setImageName(file?.name ?? "");
                setImageFile(file);
              }
            }
            type="file"
          />
        </label>

        <fieldset className="theme-fieldset">
          <legend>2. Qual estilo combina com o momento?</legend>
          <div className="theme-options">
            {themes.map((option) => (
              <button
                className={theme === option ? "selected" : ""}
                key={option}
                onClick={() => setTheme(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="text-field">
          <span>3. Para qual ocasião?</span>
          <input
            onChange={(event) => setOccasion(event.target.value)}
            placeholder="Ex.: LinkedIn, aniversário, viagem, presente..."
            value={occasion}
          />
        </label>

        <label className="text-field">
          <span>4. Tem algum detalhe que você gostaria?</span>
          <textarea
            onChange={(event) => setStyle(event.target.value)}
            placeholder="Ex.: roupas claras, ambiente elegante, luz de pôr do sol..."
            rows={3}
            value={style}
          />
        </label>

        {description && (
          <div className="prompt-preview">
            <span>Seu pedido</span>
            <p>{description}.</p>
          </div>
        )}

        <div className="new-shoot-total">
          <div>
            <strong>
              {photoCount} opções, {includedPhotos}{" "}
              {includedPhotos === 1 ? "foto incluída" : "fotos incluídas"}
            </strong>
            <span>Outras fotos são opcionais</span>
          </div>
          <strong>{money.format(price)}</strong>
        </div>

        <button
          className="primary-button new-shoot-submit"
          disabled={!imageName || !theme || submitting}
          onClick={submit}
          type="button"
        >
          {submitting ? "Preparando..." : "Continuar para o pagamento"}
        </button>
        {error && <p className="form-error">{error}</p>}
      </section>
    </main>
  );
}
