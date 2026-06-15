"use client";

import { useMemo, useState } from "react";

const MAX_PHOTOS = 20;
const DEFAULT_GALLERY_SIZE = 15;
const DEFAULT_PAID_AMOUNT = 7.9;
const DEFAULT_INCLUDED_PHOTOS = 1;

const samplePhotos = Array.from({ length: MAX_PHOTOS }, (_, index) => ({
  id: `photo-${index + 1}`,
  number: index + 1,
  tone: (index * 19 + 8) % 360,
}));

// Canonical curve for the default R$ 7,90 / 1-photo offer.
const basePricesByQuantity = [
  0, 7.9, 15.8, 22.8, 27.8, 32.8, 37.3, 41.3, 45.3, 49.3, 52.8,
  56.3, 59.3, 62.3, 65.3, 67.8, 71.3, 74.3, 77.3, 80.3, 82.8,
];

const standardMilestones = [
  { quantity: 1, label: "Incluída" },
  { quantity: 3, label: "Trio" },
  { quantity: 5, label: "Favoritas" },
  { quantity: 10, label: "Ensaio" },
  { quantity: 15, label: "Coleção" },
  { quantity: 20, label: "Galeria completa" },
];

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export type GalleryOffer = {
  paidAmount: number;
  includedPhotos: number;
  gallerySize: number;
  videoPrice: number;
  newShootPrice: number;
};

function normalizeOffer(offer?: Partial<GalleryOffer>): GalleryOffer {
  const includedPhotos = Math.min(
    MAX_PHOTOS,
    Math.max(1, Math.round(offer?.includedPhotos ?? DEFAULT_INCLUDED_PHOTOS)),
  );
  const paidAmount = Math.max(0.01, offer?.paidAmount ?? DEFAULT_PAID_AMOUNT);
  const gallerySize = Math.min(
    MAX_PHOTOS,
    Math.max(
      includedPhotos,
      Math.round(offer?.gallerySize ?? DEFAULT_GALLERY_SIZE),
    ),
  );
  const videoPrice = Math.max(0, offer?.videoPrice ?? 19.9);
  const newShootPrice = Math.max(0, offer?.newShootPrice ?? 29.9);

  return {
    includedPhotos,
    paidAmount,
    gallerySize,
    videoPrice,
    newShootPrice,
  };
}

function createPriceCurve(offer: GalleryOffer) {
  const baseAtIncluded = basePricesByQuantity[offer.includedPhotos];
  const scale = offer.paidAmount / baseAtIncluded;

  return basePricesByQuantity.map((basePrice, quantity) => {
    if (quantity === 0) return 0;
    if (quantity <= offer.includedPhotos) return offer.paidAmount;
    return Math.round(basePrice * scale * 100) / 100;
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
  testMode = false,
}: {
  token: string;
  offer?: Partial<GalleryOffer>;
  testMode?: boolean;
}) {
  const offer = useMemo(() => normalizeOffer(offerInput), [offerInput]);
  const prices = useMemo(() => createPriceCurve(offer), [offer]);
  const milestones = useMemo(
    () => createMilestones(offer.includedPhotos, offer.gallerySize),
    [offer.gallerySize, offer.includedPhotos],
  );
  const photos = useMemo(
    () => samplePhotos.slice(0, offer.gallerySize),
    [offer.gallerySize],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [testPaymentApproved, setTestPaymentApproved] = useState(false);
  const [videoAdded, setVideoAdded] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<"photos" | "new-shoot">(
    "photos",
  );
  const [newShootPurchased, setNewShootPurchased] = useState(false);
  const [pixReady, setPixReady] = useState(false);

  function getPricing(count: number) {
    const total = count ? prices[count] : 0;
    const referenceUnit = offer.paidAmount / offer.includedPhotos;
    const fullPrice = count * referenceUnit;
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

  const pricing = getPricing(selected.length);
  const nextPrice = pricing.nextMilestone
    ? getPricing(pricing.nextMilestone.quantity)
    : null;
  const photosToNextDeal = pricing.nextMilestone
    ? pricing.nextMilestone.quantity - selected.length
    : 0;
  const selectionIsIncluded =
    selected.length > 0 && selected.length <= offer.includedPhotos;
  const checkoutAmount =
    checkoutMode === "new-shoot"
      ? offer.newShootPrice
      : pricing.dueNow + (videoAdded ? offer.videoPrice : 0);

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
    setCheckoutMode("photos");
    setTestPaymentApproved(false);
    setPixReady(false);
    setCheckoutOpen(true);
  }

  function startNewShootCheckout() {
    setCheckoutMode("new-shoot");
    setTestPaymentApproved(false);
    setPixReady(true);
  }

  function approveTestPayment() {
    if (checkoutMode === "new-shoot") {
      setNewShootPurchased(true);
    }

    setTestPaymentApproved(true);
  }

  function continueCheckout() {
    if (checkoutAmount > 0) {
      setPixReady(true);
      return;
    }

    approveTestPayment();
  }

  return (
    <main className="gallery-shell">
      <nav className="gallery-nav" aria-label="Galeria">
        <a className="brand" href="#top" aria-label="Home Studio">
          HOME <span>STUDIO</span>
        </a>
        <div className="nav-meta">
          <span className="status-dot" />
          {testMode ? "Modo de teste" : "Galeria pronta"}
        </div>
      </nav>

      <header className="gallery-header" id="top">
        <div className="gallery-intro">
          <span className="eyebrow">SEU ENSAIO ESTÁ PRONTO</span>
          <h1>Agora escolha as fotos que você mais amou.</h1>
          <p>
            Você já tem {offer.includedPhotos}{" "}
            {offer.includedPhotos === 1 ? "foto incluída" : "fotos incluídas"}.
            Se quiser levar mais, o melhor desconto será aplicado
            automaticamente.
          </p>
        </div>
        <div className="gallery-status">
          <span>{token === "demo" ? "Galeria demonstrativa" : "Sua galeria"}</span>
          <strong>{offer.gallerySize} fotos disponíveis</strong>
          <small>
            Crédito de {money.format(offer.paidAmount)} já reconhecido
          </small>
        </div>
      </header>

      <section className="deal-section" aria-labelledby="deal-title">
        <div className="deal-heading">
          <div>
            <span className="section-kicker">DESCONTO PROGRESSIVO</span>
            <h2 id="deal-title">
              {offer.includedPhotos === 1
                ? "Sua foto já está garantida."
                : `Suas ${offer.includedPhotos} fotos já estão garantidas.`}
            </h2>
          </div>
          <button className="text-button" onClick={selectAll} type="button">
            Quero todas
          </button>
        </div>

        <div className="milestone-track">
          {milestones.map((milestone) => {
            const milestonePricing = getPricing(milestone.quantity);
            const reached = selected.length >= milestone.quantity;
            const isNext =
              pricing.nextMilestone?.quantity === milestone.quantity;
            const isIncluded =
              milestone.quantity === offer.includedPhotos;

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
                <strong>{money.format(milestonePricing.total)}</strong>
                <small>
                  {isIncluded
                    ? "já pago"
                    : `${money.format(milestonePricing.unitPrice)}/foto`}
                </small>
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
                {money.format(nextPrice.dueNow - pricing.dueNow)} a mais
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
        {photos.map((photo) => {
          const selectionPosition = selected.indexOf(photo.id);
          const isSelected = selectionPosition >= 0;

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
                  background: `linear-gradient(145deg, hsl(${photo.tone} 34% 25%), hsl(${photo.tone + 42} 46% 68%))`,
                }}
              />
              <span className="photo-shade" />
              <span className="watermark-pattern" aria-hidden="true">
                {Array.from({ length: 12 }, (_, index) => (
                  <span key={index}>HOME STUDIO</span>
                ))}
              </span>
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
            {selected.length > offer.includedPhotos &&
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
                    {money.format(offer.paidAmount)} já pagos
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
              : selected.length > offer.includedPhotos
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

            {!testMode ? (
              <>
                <span className="modal-badge warning">Integração pendente</span>
                <h2 id="checkout-title">Pagamento em configuração.</h2>
                <p>
                  A interface está pronta, mas o Mercado Pago ainda precisa ser
                  conectado antes de aceitar pagamentos reais.
                </p>
                <button
                  className="primary-button modal-primary"
                  onClick={() => setCheckoutOpen(false)}
                  type="button"
                >
                  Entendi
                </button>
              </>
            ) : testPaymentApproved ? (
              <>
                <span className="modal-badge success">Pagamento aprovado</span>
                {newShootPurchased ? (
                  <>
                    <h2 id="checkout-title">Seu novo ensaio foi reservado.</h2>
                    <p>
                      O próximo passo será escolher um novo tema pelo WhatsApp,
                      usando a mesma foto de referência.
                    </p>
                    <button
                      className="primary-button modal-primary"
                      onClick={() => setCheckoutOpen(false)}
                      type="button"
                    >
                      Concluir
                    </button>
                  </>
                ) : (
                  <>
                    <h2 id="checkout-title">Suas fotos foram liberadas.</h2>
                    <p>
                      Os arquivos escolhidos ficarão disponíveis para download
                      e o vídeo será produzido quando estiver no pedido.
                    </p>
                    <div className="post-purchase-offer">
                      <span>NOVO TEMA, NOVO ENSAIO</span>
                      <strong>
                        Crie outra coleção por {money.format(offer.newShootPrice)}
                      </strong>
                      <small>
                        Aproveite a mesma referência e escolha uma proposta
                        completamente diferente.
                      </small>
                      <button
                        className="primary-button modal-primary"
                        onClick={startNewShootCheckout}
                        type="button"
                      >
                        Quero um novo ensaio
                      </button>
                      <button
                        className="text-button muted"
                        onClick={() => setCheckoutOpen(false)}
                        type="button"
                      >
                        Agora não
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : pixReady ? (
              <>
                <span className="modal-badge warning">Simulação de Pix</span>
                <h2 id="checkout-title">{money.format(checkoutAmount)}</h2>
                <p>
                  {checkoutMode === "new-shoot"
                    ? "Este Pix confirma um segundo ensaio com outro tema."
                    : "Em produção, o QR Code e o Pix Copia e Cola serão gerados pelo Mercado Pago."}
                </p>
                <div className="fake-pix-code" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <strong>PIX</strong>
                </div>
                <button
                  className="primary-button modal-primary"
                  onClick={approveTestPayment}
                  type="button"
                >
                  Simular pagamento aprovado
                </button>
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
                    ? "Deixe suas fotos ainda mais marcantes."
                    : `${selected.length} fotos selecionadas`}
                </h2>
                <p>
                  Adicione um vídeo vertical pronto para Reels, Stories e
                  WhatsApp usando as fotos que você escolheu.
                </p>
                <button
                  aria-pressed={videoAdded}
                  className={`addon-card ${videoAdded ? "selected" : ""}`}
                  onClick={() => setVideoAdded((current) => !current)}
                  type="button"
                >
                  <span className="addon-check">{videoAdded ? "✓" : "+"}</span>
                  <span className="addon-copy">
                    <strong>Transformar em vídeo</strong>
                    <small>
                      Edição automática com movimento, música e formato vertical
                    </small>
                  </span>
                  <strong>{money.format(offer.videoPrice)}</strong>
                </button>
                <div className="modal-total">
                  <span>
                    {pricing.dueNow > 0
                      ? `Fotos adicionais: ${money.format(pricing.dueNow)}`
                      : "Fotos escolhidas já incluídas"}
                  </span>
                  <strong>
                    {checkoutAmount > 0
                      ? `Pagar ${money.format(checkoutAmount)}`
                      : "Sem valor adicional"}
                  </strong>
                </div>
                <button
                  className="primary-button modal-primary"
                  onClick={continueCheckout}
                  type="button"
                >
                  {checkoutAmount > 0
                    ? "Continuar para o Pix"
                    : "Liberar minhas fotos"}
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
