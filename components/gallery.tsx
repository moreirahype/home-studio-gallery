"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_PHOTOS = 20;
const DEFAULT_GALLERY_SIZE = 15;
const DEFAULT_PAID_AMOUNT = 7.9;
const DEFAULT_INCLUDED_PHOTOS = 1;
const DEFAULT_FIRST_EXTRA_AMOUNT = 9.9;

const samplePhotos = Array.from({ length: MAX_PHOTOS }, (_, index) => ({
  id: `photo-${index + 1}`,
  number: index + 1,
  tone: (index * 19 + 8) % 360,
  previewUrl: "",
}));

// Canonical curve for the default R$ 7,90 / 1-photo offer.
const basePricesByQuantity = [
  0, 7.9, 17.8, 25.8, 31.8, 35.8, 39.8, 42.8, 45.8, 49.8, 52.8,
  55.8, 58.8, 61.8, 64.8, 67.8, 71.8, 74.8, 77.8, 80.8, 82.8,
];
const videoPricesByQuantity = [0, 19.9, 29.9, 39.9, 49.9, 59.9];

const standardMilestones = [
  { quantity: 1, label: "Incluída" },
  { quantity: 3, label: "Trio" },
  { quantity: 5, label: "Favoritas" },
  { quantity: 10, label: "Ensaio" },
  { quantity: 15, label: "Galeria completa" },
  { quantity: 20, label: "Galeria completa" },
];

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export type GalleryOffer = {
  paidAmount: number;
  pricingBaseAmount: number;
  includedPhotos: number;
  gallerySize: number;
  videoPrice: number;
  newShootPrice: number;
  expressShootPrice: number;
};

export type GalleryPhoto = {
  id: string;
  number: number;
  previewUrl: string;
};

function normalizeOffer(offer?: Partial<GalleryOffer>): GalleryOffer {
  const includedPhotos = Math.min(
    MAX_PHOTOS,
    Math.max(1, Math.round(offer?.includedPhotos ?? DEFAULT_INCLUDED_PHOTOS)),
  );
  const paidAmount = Math.max(0.01, offer?.paidAmount ?? DEFAULT_PAID_AMOUNT);
  const pricingReferenceQuantity = Math.min(MAX_PHOTOS - 1, includedPhotos);
  const defaultPricingBaseAmount =
    DEFAULT_FIRST_EXTRA_AMOUNT *
    (basePricesByQuantity[pricingReferenceQuantity] /
      (basePricesByQuantity[pricingReferenceQuantity + 1] -
        basePricesByQuantity[pricingReferenceQuantity]));
  const pricingBaseAmount = Math.max(
    0.01,
    offer?.pricingBaseAmount ?? defaultPricingBaseAmount,
  );
  const gallerySize = Math.min(
    MAX_PHOTOS,
    Math.max(
      includedPhotos,
      Math.round(offer?.gallerySize ?? DEFAULT_GALLERY_SIZE),
    ),
  );
  const videoPrice = Math.max(0, offer?.videoPrice ?? 19.9);
  const newShootPrice = Math.max(0, offer?.newShootPrice ?? 7.9);
  const expressShootPrice = Math.max(0, offer?.expressShootPrice ?? 4.9);

  return {
    includedPhotos,
    paidAmount,
    pricingBaseAmount,
    gallerySize,
    videoPrice,
    newShootPrice,
    expressShootPrice,
  };
}

function createPriceCurve(offer: GalleryOffer) {
  const baseAtIncluded = basePricesByQuantity[offer.includedPhotos];
  const scale = offer.pricingBaseAmount / baseAtIncluded;

  return basePricesByQuantity.map((basePrice, quantity) => {
    if (quantity === 0) return 0;
    if (quantity <= offer.includedPhotos) return offer.paidAmount;
    const scaledAdditional =
      Math.round(
        (basePrice - basePricesByQuantity[offer.includedPhotos]) * scale * 100,
      ) / 100;
    return offer.paidAmount + Math.max(0, scaledAdditional);
  });
}

function createMilestones(includedPhotos: number, gallerySize: number) {
  const milestones = standardMilestones.filter(
    (milestone) =>
      milestone.quantity >= includedPhotos &&
      milestone.quantity <= gallerySize,
  );

  if (!milestones.some((milestone) => milestone.quantity === includedPhotos)) {
    milestones.unshift({
      quantity: includedPhotos,
      label: `${includedPhotos} incluídas`,
    });
  } else {
    milestones[0] = {
      ...milestones[0],
      label:
        includedPhotos === 1 ? "Já incluída" : `${includedPhotos} já incluídas`,
    };
  }

  return milestones;
}

function getVideoPrice(videoCount: number) {
  const safeCount = Math.min(MAX_PHOTOS, Math.max(0, Math.round(videoCount)));
  if (!safeCount) return 0;

  return (
    videoPricesByQuantity[safeCount] ??
    videoPricesByQuantity[5] + (safeCount - 5) * 8.9
  );
}

function AddIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function Gallery({
  token,
  offer: offerInput,
  galleryPhotos,
  testMode = false,
}: {
  token: string;
  offer?: Partial<GalleryOffer>;
  galleryPhotos?: GalleryPhoto[];
  testMode?: boolean;
}) {
  const router = useRouter();
  const offer = useMemo(() => normalizeOffer(offerInput), [offerInput]);
  const prices = useMemo(() => createPriceCurve(offer), [offer]);
  const milestones = useMemo(
    () => createMilestones(offer.includedPhotos, offer.gallerySize),
    [offer.gallerySize, offer.includedPhotos],
  );
  const photos = useMemo(
    () =>
      galleryPhotos === undefined
        ? samplePhotos.slice(0, offer.gallerySize)
        : galleryPhotos,
    [galleryPhotos, offer.gallerySize],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [testPaymentApproved, setTestPaymentApproved] = useState(false);
  const [videoAdded, setVideoAdded] = useState(false);
  const [videoPhotoIds, setVideoPhotoIds] = useState<string[]>([]);
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const [pixReady, setPixReady] = useState(false);
  const [downloadLinks, setDownloadLinks] = useState<
    { photoId: string; number: number; url: string }[]
  >([]);
  const [unlockedPhotoIds, setUnlockedPhotoIds] = useState<string[]>([]);
  const [unlockedViews, setUnlockedViews] = useState<Record<string, string>>({});
  const [photoCredit, setPhotoCredit] = useState(offer.paidAmount);
  const [videoAccess, setVideoAccess] = useState<{
    status: string;
    url?: string | null;
    clips?: { number: number; url: string }[];
    error?: string | null;
  } | null>(null);
  const [relatedGalleries, setRelatedGalleries] = useState<
    { token: string; title: string; status?: string | null; url: string }[]
  >([]);
  const [checkoutError, setCheckoutError] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [creatingPix, setCreatingPix] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [pixPayment, setPixPayment] = useState<{
    orderId: string;
    paymentId: string;
    amount: number;
    qrCode?: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
  } | null>(null);
  const videoPhotos = useMemo(() => {
    return videoPhotoIds
      .map((photoId) => photos.find((photo) => photo.id === photoId))
      .filter((photo): photo is (typeof photos)[number] => Boolean(photo));
  }, [photos, videoPhotoIds]);

  function getPricing(count: number) {
    const total = count ? prices[count] : 0;
    const referenceUnit =
      (offer.pricingBaseAmount / offer.includedPhotos) * 1.25;
    const fullPrice =
      offer.paidAmount +
      Math.max(0, count - offer.includedPhotos) * referenceUnit;
    const savings = Math.max(0, fullPrice - total);
    const discount = count ? Math.round((savings / fullPrice) * 100) : 0;
    const unitPrice = count ? total / count : 0;
    const dueNow =
      count > offer.includedPhotos ? Math.max(0, total - offer.paidAmount) : 0;
    const nextMilestone = milestones.find(
      (milestone) => milestone.quantity > count,
    );

    return {
      total,
      savings,
      discount,
      unitPrice,
      dueNow,
      nextMilestone,
    };
  }

  const targetPhotoCount = new Set([...unlockedPhotoIds, ...selected]).size;
  const basePricing = getPricing(targetPhotoCount);
  const pricing = {
    ...basePricing,
    dueNow: selected.length
      ? Math.max(0, basePricing.total - photoCredit)
      : 0,
  };
  const nextPrice = pricing.nextMilestone
    ? getPricing(pricing.nextMilestone.quantity)
    : null;
  const photosToNextDeal = pricing.nextMilestone
    ? Math.max(0, pricing.nextMilestone.quantity - targetPhotoCount)
    : 0;
  const nextDealAdditional = nextPrice
    ? Math.max(0, nextPrice.total - photoCredit) - pricing.dueNow
    : 0;
  const firstExtraAmount =
    prices[Math.min(MAX_PHOTOS, offer.includedPhotos + 1)] -
    prices[offer.includedPhotos];
  const newShootUrl = `/novo?source=${encodeURIComponent(
    token,
  )}&paidAmount=7.90&includedPhotos=1&generationCount=15&firstExtraAmount=${firstExtraAmount.toFixed(
    2,
  )}`;
  const hasUnlockedPurchases =
    unlockedPhotoIds.length > 0 || photoCredit > offer.paidAmount + 0.005;
  const selectionIsIncluded = selected.length > 0 && pricing.dueNow === 0;
  const videoPrice = videoAdded ? getVideoPrice(videoPhotoIds.length || 1) : 0;
  const checkoutAmount =
    pricing.dueNow + videoPrice;

  const refreshAccess = useCallback(async () => {
    if (token === "demo") return;
    const response = await fetch(
      `/api/gallery/access?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const result = (await response.json()) as {
      ok: boolean;
      photoCredit?: number;
      photos?: {
        photoId: string;
        number: number;
        viewUrl?: string;
        downloadUrl?: string;
      }[];
      video?: {
        status: string;
        url?: string | null;
        clips?: { number: number; url: string }[];
        error?: string | null;
      } | null;
      relatedGalleries?: {
        token: string;
        title: string;
        status?: string | null;
        url: string;
      }[];
    };

    if (!response.ok || !result.ok) return;
    const unlocked = result.photos ?? [];
    setUnlockedPhotoIds(unlocked.map((photo) => photo.photoId));
    setUnlockedViews(
      Object.fromEntries(
        unlocked
          .filter((photo) => photo.viewUrl)
          .map((photo) => [photo.photoId, photo.viewUrl as string]),
      ),
    );
    setDownloadLinks(
      unlocked
        .filter((photo) => photo.downloadUrl)
        .map((photo) => ({
          photoId: photo.photoId,
          number: photo.number,
          url: photo.downloadUrl as string,
        })),
    );
    if (typeof result.photoCredit === "number") {
      setPhotoCredit(result.photoCredit);
    }
    setVideoAccess(result.video ?? null);
    setRelatedGalleries(result.relatedGalleries ?? []);
  }, [token]);

  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  useEffect(() => {
    if (
      token === "demo" ||
      galleryPhotos === undefined ||
      photos.length >= offer.gallerySize
    ) {
      return;
    }
    const interval = window.setInterval(() => router.refresh(), 15000);
    return () => window.clearInterval(interval);
  }, [galleryPhotos, offer.gallerySize, photos.length, router, token]);

  useEffect(() => {
    if (token === "demo") return;
    const interval = window.setInterval(
      () => void refreshAccess(),
      10 * 60 * 1000,
    );
    return () => window.clearInterval(interval);
  }, [refreshAccess, token]);

  useEffect(() => {
    if (videoAccess?.status !== "generating") return;
    const interval = window.setInterval(() => void refreshAccess(), 15000);
    return () => window.clearInterval(interval);
  }, [refreshAccess, videoAccess?.status]);

  function togglePhoto(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((photoId) => photoId !== id)
        : [...current, id],
    );
  }

  function selectAll() {
    setSelected(photos.map((photo) => photo.id));
  }

  function handlePrimaryAction() {
    if (!selected.length) return;
    setTestPaymentApproved(false);
    setPixReady(false);
    setVideoPhotoIds(selected.slice(0, 1));
    setVideoPickerOpen(false);
    setCheckoutError("");
    setPixPayment(null);
    setPixCopied(false);
    setCheckoutOpen(true);
  }

  async function copyPixCode() {
    if (!pixPayment?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixPayment.qrCode);
      setCheckoutError("");
      setPixCopied(true);
      window.setTimeout(() => setPixCopied(false), 3500);
    } catch {
      setCheckoutError(
        "Não foi possível copiar automaticamente. Toque e segure o código Pix para copiar.",
      );
    }
  }

  function approveTestPayment() {
    setTestPaymentApproved(true);
  }

  function toggleVideoPhoto(id: string) {
    setVideoPhotoIds((current) => {
      if (current.includes(id)) {
        return current.length === 1
          ? current
          : current.filter((photoId) => photoId !== id);
      }

      return [...current, id];
    });
  }

  async function releaseIncludedPhotos() {
    if (token === "demo") {
      approveTestPayment();
      return;
    }

    setReleasing(true);
    setCheckoutError("");
    const response = await fetch("/api/downloads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ galleryToken: token, photoIds: selected }),
    });
    const result = (await response.json()) as {
      ok: boolean;
      error?: string;
      downloads?: {
        photoId: string;
        number: number;
        url: string;
        viewUrl?: string;
      }[];
    };
    setReleasing(false);

    if (!response.ok || !result.ok || !result.downloads) {
      setCheckoutError(result.error ?? "Não foi possível liberar as fotos.");
      return;
    }

    setDownloadLinks(result.downloads);
    setUnlockedPhotoIds((current) => [
      ...new Set([...current, ...result.downloads!.map((item) => item.photoId)]),
    ]);
    setUnlockedViews((current) => ({
      ...current,
      ...Object.fromEntries(
        result.downloads!
          .filter((item) => item.viewUrl)
          .map((item) => [item.photoId, item.viewUrl as string]),
      ),
    }));
    setTestPaymentApproved(true);
    void refreshAccess();
  }

  async function continueCheckout() {
    if (checkoutAmount > 0) {
      if (testMode || token === "demo") {
        setPixReady(true);
        return;
      }

      setCreatingPix(true);
      setCheckoutError("");
      const response = await fetch("/api/checkout/pix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          galleryToken: token,
          photoIds: selected,
          videoAdded,
          videoPhotoIds,
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
        orderId?: string;
        paymentId?: string;
        amount?: number;
        qrCode?: string;
        qrCodeBase64?: string;
        ticketUrl?: string;
      };
      setCreatingPix(false);

      if (!response.ok || !result.ok || !result.orderId || !result.paymentId) {
        setCheckoutError(result.error ?? "Não foi possível gerar o Pix.");
        return;
      }

      setPixPayment({
        orderId: result.orderId,
        paymentId: result.paymentId,
        amount: result.amount ?? checkoutAmount,
        qrCode: result.qrCode,
        qrCodeBase64: result.qrCodeBase64,
        ticketUrl: result.ticketUrl,
      });
      setPixReady(true);
      return;
    }

    await releaseIncludedPhotos();
  }

  async function checkPaymentAndRelease() {
    if (!pixPayment) {
      approveTestPayment();
      return;
    }

    setCheckingPayment(true);
    setCheckoutError("");
    const response = await fetch("/api/checkout/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        galleryToken: token,
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
      setCheckoutError(result.error ?? "Não foi possível conferir o pagamento.");
      return;
    }

    if (!result.paid) {
      setCheckoutError(
        "Ainda não encontrei o pagamento. Tente novamente em alguns segundos.",
      );
      return;
    }

    await releaseIncludedPhotos();
  }

  return (
    <main className="gallery-shell">
      <nav className="gallery-nav" aria-label="Galeria">
        <a className="brand" href="#top" aria-label="Home Studio">
          HOME <span>STUDIO</span>
        </a>
        <div className="nav-meta">
          <span className="status-dot" />
          {testMode
            ? "Modo de teste"
            : photos.length < offer.gallerySize
              ? "Preparando fotos"
              : "Galeria pronta"}
        </div>
      </nav>

      <header className="gallery-header" id="top">
        <div className="gallery-intro">
          <span className="eyebrow">
            {photos.length < offer.gallerySize
              ? "SEU ENSAIO ESTÁ SENDO PREPARADO"
              : "SEU ENSAIO ESTÁ PRONTO"}
          </span>
          <h1>
            {photos.length < offer.gallerySize
              ? "As primeiras fotos já estão aparecendo."
              : "Agora escolha as fotos que você mais amou."}
          </h1>
          <p>
            Você já tem {offer.includedPhotos}{" "}
            {offer.includedPhotos === 1 ? "foto incluída" : "fotos incluídas"}.
            Se quiser levar mais, o melhor desconto será aplicado
            automaticamente.
          </p>
        </div>
        <div className="gallery-status">
          <span>{token === "demo" ? "Galeria demonstrativa" : "Sua galeria"}</span>
          <strong>
            {galleryPhotos === undefined
              ? offer.gallerySize
              : galleryPhotos.length}{" "}
            fotos disponíveis
          </strong>
          <small>
            Crédito de {money.format(offer.paidAmount)} reconhecido. Galeria
            disponível por 7 dias; depois disso, os arquivos são excluídos.
          </small>
        </div>
      </header>

      {(downloadLinks.length > 0 || videoAccess || relatedGalleries.length > 0) && (
        <section className="owned-files" aria-label="Arquivos liberados">
          <div>
            <span className="section-kicker">SUAS COMPRAS</span>
            <h2>Seus arquivos ficam aqui por 7 dias.</h2>
            <p>
              Baixe novamente suas fotos e vídeos liberados, ou acesse outros
              ensaios que você comprou.
            </p>
            <div className="auto-release-note">
              <strong>Pagamento confirmado automaticamente.</strong>
              <span>
                Não precisa enviar comprovante no WhatsApp. As fotos compradas
                já foram liberadas aqui na galeria.
              </span>
            </div>
          </div>
          <div className="owned-actions">
            {downloadLinks.map((download) => (
              <a
                className="secondary-button"
                download
                href={download.url}
                key={download.photoId}
              >
                Baixar foto {String(download.number).padStart(2, "0")}
              </a>
            ))}
            {videoAccess?.status === "generating" && (
              <span className="file-status">Vídeo em produção...</span>
            )}
            {videoAccess?.status === "failed" && (
              <span className="file-status error">
                Não foi possível concluir o vídeo. Fale com o suporte.
              </span>
            )}
            {videoAccess?.url && (
              <a className="primary-button" download href={videoAccess.url}>
                Baixar meu vídeo
              </a>
            )}
            {!videoAccess?.url &&
              videoAccess?.clips?.map((clip) => (
                <a
                  className="primary-button"
                  download
                  href={clip.url}
                  key={clip.url}
                >
                  Baixar vídeo {String(clip.number).padStart(2, "0")}
                </a>
              ))}
            {relatedGalleries.map((gallery) => (
              <a
                className="secondary-button"
                href={gallery.url}
                key={gallery.token}
              >
                Abrir {gallery.title}
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="deal-section" aria-labelledby="deal-title">
        <div className="deal-heading">
          <div>
            <span className="section-kicker">DESCONTO PROGRESSIVO</span>
            <h2 id="deal-title">
              {hasUnlockedPurchases
                ? "Quer liberar mais fotos?"
                : offer.includedPhotos === 1
                  ? "Sua foto já está garantida."
                  : `Suas ${offer.includedPhotos} fotos já estão garantidas.`}
            </h2>
            {hasUnlockedPurchases && (
              <p className="deal-note">
                Os valores abaixo mostram apenas o que falta para chegar em cada
                faixa. O que você já liberou continua garantido.
              </p>
            )}
          </div>
          <button className="text-button" onClick={selectAll} type="button">
            Quero todas
          </button>
        </div>

        <div className="milestone-track">
          {milestones.map((milestone) => {
            const milestonePricing = getPricing(milestone.quantity);
            const reached = targetPhotoCount >= milestone.quantity;
            const isNext =
              pricing.nextMilestone?.quantity === milestone.quantity;
            const isIncluded =
              milestone.quantity === offer.includedPhotos;
            const remainingForMilestone = Math.max(
              0,
              milestonePricing.total - photoCredit,
            );
            const milestoneAmountLabel = hasUnlockedPurchases
              ? remainingForMilestone > 0
                ? `+ ${money.format(remainingForMilestone)}`
                : "Liberado"
              : money.format(milestonePricing.total);
            const milestoneHelpLabel = hasUnlockedPurchases
              ? remainingForMilestone > 0
                ? `para ${milestone.quantity} fotos`
                : "já liberado"
              : isIncluded
                ? "já pago"
                : `${money.format(milestonePricing.unitPrice)}/foto`;

            return (
              <div
                className={`milestone ${reached ? "reached" : ""} ${isNext ? "next" : ""}`}
                key={milestone.quantity}
              >
                {milestone.quantity === offer.gallerySize && (
                  <span className="best-value">Melhor valor</span>
                )}
                <span className="milestone-count">{milestone.quantity}</span>
                <span className="milestone-label">{milestone.label}</span>
                <strong>{milestoneAmountLabel}</strong>
                <small>{milestoneHelpLabel}</small>
              </div>
            );
          })}
        </div>

        {selected.length > 0 && pricing.nextMilestone && nextPrice && (
          <div className="smart-nudge" role="status">
            <span className="nudge-icon" aria-hidden="true">
              ↓
            </span>
            <p>
              Selecione mais <strong>{photosToNextDeal}</strong>{" "}
              {photosToNextDeal === 1 ? "foto" : "fotos"} e chegue ao pacote{" "}
              <strong>{pricing.nextMilestone.label}</strong>. Você leva{" "}
              {pricing.nextMilestone.quantity} por apenas{" "}
              <strong>
                {money.format(Math.max(0, nextDealAdditional))} a mais
              </strong>
              .
            </p>
          </div>
        )}
      </section>

      <div className="selection-heading">
        <div>
          <span className="section-kicker">SUAS FOTOS</span>
          <h2>Toque para selecionar</h2>
        </div>
        {selected.length > 0 && (
          <button
            className="text-button muted"
            onClick={() => setSelected([])}
            type="button"
          >
            Limpar seleção
          </button>
        )}
      </div>

      <section className="photo-grid" aria-label="Fotos disponíveis">
        {galleryPhotos !== undefined && photos.length === 0 && (
          <div className="gallery-processing">
            <span className="status-dot" />
            <strong>Estamos preparando seu ensaio.</strong>
            <p>
              As fotos aparecerão aqui conforme forem finalizadas. Você pode
              voltar usando este mesmo link.
            </p>
          </div>
        )}
        {photos.map((photo) => {
          const selectionPosition = selected.indexOf(photo.id);
          const isSelected = selectionPosition >= 0;
          const isUnlocked = unlockedPhotoIds.includes(photo.id);
          const displayUrl = unlockedViews[photo.id] ?? photo.previewUrl;
          const tone =
            "tone" in photo && typeof photo.tone === "number" ? photo.tone : 0;

          return (
            <button
              aria-label={`${isSelected ? "Remover" : "Selecionar"} foto ${photo.number}`}
              aria-pressed={isSelected}
              className={`photo-card ${isSelected ? "selected" : ""}`}
              key={photo.id}
              onClick={() => togglePhoto(photo.id)}
              type="button"
            >
              <span
                className="photo-placeholder"
                style={{
                  background: displayUrl
                    ? `center / cover no-repeat url("${displayUrl}")`
                    : `linear-gradient(145deg, hsl(${tone} 34% 25%), hsl(${tone + 42} 46% 68%))`,
                }}
              />
              <span className="photo-shade" />
              {!isUnlocked && (
                <span className="watermark-pattern" aria-hidden="true">
                  {Array.from({ length: 18 }, (_, index) => (
                    <span key={index}>HOMESTUDIO.IA</span>
                  ))}
                </span>
              )}
              {isUnlocked && (
                <span className="unlocked-badge">Liberada</span>
              )}
              <span className="photo-number">
                Foto {String(photo.number).padStart(2, "0")}
              </span>
              <span className="checkmark">
                {isSelected ? (
                  <span className="selection-order">
                    {selectionPosition + 1}
                  </span>
                ) : (
                  <AddIcon />
                )}
              </span>
            </button>
          );
        })}
      </section>

      <aside className={`checkout-bar ${selected.length ? "active" : ""}`}>
        <div className="checkout-summary">
          <div className="checkout-count">
            <span>
              {selected.length
                ? `${selected.length} ${selected.length === 1 ? "foto selecionada" : "fotos selecionadas"}`
                : "Nenhuma foto selecionada"}
            </span>
            {targetPhotoCount > offer.includedPhotos &&
              pricing.discount > 0 && (
                <strong className="discount-pill">
                  -{pricing.discount}%
                </strong>
              )}
          </div>
          <div className="checkout-pricing">
            <strong>
              {selectionIsIncluded
                ? "Incluída"
                : money.format(pricing.dueNow)}
            </strong>
            {selected.length > 0 && (
              <span>
                {selectionIsIncluded ? (
                  <>
                    Até {offer.includedPhotos}{" "}
                    {offer.includedPhotos === 1 ? "foto já paga" : "fotos já pagas"}
                  </>
                ) : (
                  <>
                    Total {money.format(pricing.total)} ·{" "}
                    {money.format(photoCredit)} já pagos
                  </>
                )}
              </span>
            )}
          </div>
        </div>
        <button
          className="primary-button checkout-button"
          disabled={!selected.length}
          onClick={handlePrimaryAction}
          type="button"
        >
          <span>
            {testPaymentApproved
              ? "Baixar fotos liberadas"
              : selectionIsIncluded
              ? selected.length === 1
                ? "Baixar foto incluída"
                : "Baixar fotos incluídas"
              : pricing.dueNow > 0
                ? "Pagar adicionais no Pix"
                : "Escolha suas fotos"}
          </span>
          {selected.length > 0 && <span aria-hidden="true">→</span>}
        </button>
      </aside>

      {checkoutOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="checkout-title"
            aria-modal="true"
            className="checkout-modal"
            role="dialog"
          >
            <button
              aria-label="Fechar"
              className="modal-close"
              onClick={() => setCheckoutOpen(false)}
              type="button"
            >
              ×
            </button>

            {testPaymentApproved ? (
              <>
                <span className="modal-badge success">Pagamento aprovado</span>
                <h2 id="checkout-title">Suas fotos estão liberadas.</h2>
                <p>
                  Baixe agora os arquivos escolhidos. Sua galeria continua neste
                  link por 7 dias caso queira voltar e liberar mais fotos.
                </p>
                <div className="auto-release-note modal-note">
                  <strong>Não envie comprovante no WhatsApp.</strong>
                  <span>
                    O pagamento já foi reconhecido e suas fotos selecionadas
                    foram liberadas automaticamente aqui.
                  </span>
                </div>
                {downloadLinks.length > 0 && (
                  <div className="download-list">
                    {downloadLinks.map((download) => (
                      <a
                        className="primary-button"
                        download
                        href={download.url}
                        key={download.photoId}
                      >
                        Baixar foto {String(download.number).padStart(2, "0")}
                      </a>
                    ))}
                    <small>
                      Os links de download expiram em 15 minutos, mas você pode
                      gerar novos links nesta galeria por 7 dias.
                    </small>
                  </div>
                )}
                <button
                  className="text-button muted"
                  onClick={() => setCheckoutOpen(false)}
                  type="button"
                >
                  Continuar vendo minha galeria
                </button>
                <div className="post-purchase-offer">
                  <span>CRIAR OUTRO ENSAIO</span>
                  <strong>
                    Quer gerar outro tema? 15 novas opções e 1 foto incluída por{" "}
                    {money.format(offer.newShootPrice)}
                  </strong>
                  <small>
                    É o mesmo modelo da entrada: você escolhe uma nova foto de
                    referência, descreve o tema e recebe outra galeria com
                    desconto progressivo nas fotos extras.
                  </small>
                  <button
                    className="primary-button modal-primary"
                    onClick={() => {
                      setCheckoutOpen(false);
                      window.location.href = newShootUrl;
                    }}
                    type="button"
                  >
                    Criar novo ensaio por {money.format(offer.newShootPrice)}
                  </button>
                  <button
                    className="text-button muted"
                    onClick={() => setCheckoutOpen(false)}
                    type="button"
                  >
                    Continuar com este ensaio
                  </button>
                </div>
              </>
            ) : pixReady ? (
              <>
                <span className="modal-badge warning">
                  {pixPayment ? "Pix gerado" : "Simulação de Pix"}
                </span>
                <h2 id="checkout-title">
                  {money.format(pixPayment?.amount ?? checkoutAmount)}
                </h2>
                <p>
                  Pague com o QR Code ou use o Pix Copia e Cola. Assim que o
                  pagamento for aprovado, suas fotos serão liberadas aqui.
                </p>
                <div className="auto-release-note modal-note pre-payment-note">
                  <strong>Não mande comprovante no WhatsApp.</strong>
                  <span>
                    Depois de pagar no app do banco, volte para esta tela e toque
                    no botão de liberar fotos. A liberação é automática.
                  </span>
                </div>
                {pixPayment?.qrCodeBase64 ? (
                  <img
                    alt="QR Code Pix"
                    className="pix-qr-image"
                    src={`data:image/png;base64,${pixPayment.qrCodeBase64}`}
                  />
                ) : (
                  <div className="fake-pix-code" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <strong>PIX</strong>
                  </div>
                )}
                {pixPayment?.qrCode && (
                  <button
                    className={`copy-pix-button ${pixCopied ? "copied" : ""}`}
                    onClick={copyPixCode}
                    type="button"
                  >
                    {pixCopied ? "Pix copiado! Abra seu banco" : "Copiar Pix Copia e Cola"}
                  </button>
                )}
                <button
                  className="primary-button modal-primary"
                  disabled={checkingPayment}
                  onClick={checkPaymentAndRelease}
                  type="button"
                >
                  {checkingPayment ? "Conferindo..." : "Já paguei, liberar fotos"}
                </button>
                <button
                  className="text-button muted"
                  onClick={() => setPixReady(false)}
                  type="button"
                >
                  Voltar para escolher fotos
                </button>
                {checkoutError && <p className="form-error">{checkoutError}</p>}
              </>
            ) : (
              <>
                <span className="modal-badge">
                  {selectionIsIncluded
                    ? "Crédito reconhecido"
                    : "Revise seu pedido"}
                </span>
                <h2 id="checkout-title">
                  {selectionIsIncluded
                    ? "Veja suas fotos ganharem movimento."
                    : `${selected.length} fotos selecionadas`}
                </h2>
                <p>
                  Transforme suas fotos favoritas em vídeos curtos com
                  movimento. Cada foto escolhida vira um vídeo separado para
                  você baixar e postar.
                </p>
                <div className="video-offer-preview">
                  <div
                    aria-label="Prévia das fotos usadas no vídeo"
                    className={`video-photo-strip count-${Math.min(videoPhotos.length, 3)}`}
                  >
                    {videoPhotos.map((photo, index) => {
                      const tone =
                        "tone" in photo && typeof photo.tone === "number"
                          ? photo.tone
                          : 0;

                      return (
                        <span
                          key={`${photo.id}-${index}`}
                          style={{
                            background: photo.previewUrl
                              ? `center / cover no-repeat url("${photo.previewUrl}")`
                              : `linear-gradient(145deg, hsl(${tone} 34% 25%), hsl(${tone + 42} 46% 68%))`,
                          }}
                        />
                      );
                    })}
                    <strong aria-hidden="true">▶</strong>
                  </div>
                  <div className="video-benefits">
                    <span>
                      {videoAdded
                        ? `${videoPhotoIds.length} ${videoPhotoIds.length === 1 ? "vídeo curto" : "vídeos curtos"}`
                        : "1 vídeo curto por padrão"}
                    </span>
                    <span>Vídeos separados: você usa só os favoritos</span>
                    <span>Perfeito para adicionar música no Instagram ou TikTok</span>
                  </div>
                </div>
                <button
                  aria-pressed={videoAdded}
                  className={`addon-card ${videoAdded ? "selected" : ""}`}
                  onClick={() => setVideoAdded((current) => !current)}
                  type="button"
                >
                  <span className="addon-check">{videoAdded ? "✓" : "+"}</span>
                  <span className="addon-copy">
                    <strong>Quero transformar foto em vídeo</strong>
                    <small>
                      {videoAdded
                        ? `${videoPhotoIds.length} ${videoPhotoIds.length === 1 ? "foto escolhida" : "fotos escolhidas"} para vídeo`
                        : "Começa com 1 vídeo da sua foto favorita"}
                    </small>
                  </span>
                  <span className="addon-action">
                    {videoAdded
                      ? money.format(videoPrice)
                      : `Adicionar por ${money.format(getVideoPrice(1))}`}
                  </span>
                </button>
                {videoAdded && selected.length > 1 && (
                  <div className="video-photo-choice">
                    <div className="modal-total">
                      <span>
                        {videoPhotoIds.length}{" "}
                        {videoPhotoIds.length === 1 ? "vídeo escolhido" : "vídeos escolhidos"}
                      </span>
                      <strong>{money.format(videoPrice)}</strong>
                    </div>
                    <button
                      className="text-button muted"
                      onClick={() => setVideoPhotoIds(selected)}
                      type="button"
                    >
                      Transformar todas as fotos selecionadas em vídeo
                    </button>
                    <button
                      className="text-button muted"
                      onClick={() => setVideoPickerOpen((current) => !current)}
                      type="button"
                    >
                      {videoPickerOpen
                        ? "Concluir escolha"
                        : "Escolher quais fotos viram vídeo"}
                    </button>
                    {videoPickerOpen && (
                      <>
                        <small>
                          Já deixamos 1 foto marcada. Toque nas outras fotos
                          para transformar mais delas em vídeo.
                        </small>
                        <div className="video-picker-grid">
                          {selected.map((photoId) => {
                            const photo = photos.find(
                              (item) => item.id === photoId,
                            );
                            if (!photo) return null;
                            const active = videoPhotoIds.includes(photoId);
                            const tone =
                              "tone" in photo &&
                              typeof photo.tone === "number"
                                ? photo.tone
                                : 0;

                            return (
                              <button
                                aria-label={`${active ? "Remover" : "Usar"} foto ${photo.number} no vídeo`}
                                aria-pressed={active}
                                className={active ? "selected" : ""}
                                key={photo.id}
                                onClick={() => toggleVideoPhoto(photo.id)}
                                style={{
                                  background: photo.previewUrl
                                    ? `center / cover no-repeat url("${photo.previewUrl}")`
                                    : `linear-gradient(145deg, hsl(${tone} 34% 25%), hsl(${tone + 42} 46% 68%))`,
                                }}
                                type="button"
                              >
                                <span>{active ? "✓" : "+"}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="modal-total">
                  <span>
                    {[
                      pricing.dueNow > 0
                        ? `Fotos adicionais: ${money.format(pricing.dueNow)}`
                        : "Fotos escolhidas já incluídas",
                      videoAdded && videoPrice > 0
                        ? `${videoPhotoIds.length} ${videoPhotoIds.length === 1 ? "vídeo" : "vídeos"}: ${money.format(videoPrice)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <strong>
                    {checkoutAmount > 0
                      ? `Pagar ${money.format(checkoutAmount)}`
                      : "Sem valor adicional"}
                  </strong>
                </div>
                {checkoutAmount > 0 && (
                  <div className="auto-release-note modal-note pre-payment-note">
                    <strong>Atenção antes de pagar</strong>
                    <span>
                      Não precisa enviar comprovante no WhatsApp. Após o Pix,
                      volte para esta galeria e suas fotos serão liberadas
                      automaticamente.
                    </span>
                  </div>
                )}
                <button
                  className="primary-button modal-primary"
                  disabled={releasing || creatingPix}
                  onClick={continueCheckout}
                  type="button"
                >
                  {creatingPix
                    ? "Gerando Pix..."
                    : releasing
                    ? "Liberando..."
                    : checkoutAmount > 0
                    ? "Continuar para o Pix"
                    : "Liberar minhas fotos"}
                </button>
                {checkoutError && <p className="form-error">{checkoutError}</p>}
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
