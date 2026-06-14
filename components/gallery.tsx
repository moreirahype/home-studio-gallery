"use client";

import { useMemo, useState } from "react";

const MAX_PHOTOS = 20;
const SINGLE_PHOTO_PRICE = 9.9;

const samplePhotos = Array.from({ length: MAX_PHOTOS }, (_, index) => ({
  id: `photo-${index + 1}`,
  number: index + 1,
  tone: (index * 19 + 8) % 360,
}));

const pricesByQuantity = [
  0,
  9.9,
  17.9,
  24.9,
  31.9,
  34.9,
  39.9,
  44.9,
  49.9,
  53.9,
  54.9,
  58.9,
  62.9,
  66.9,
  68.9,
  69.9,
  72.9,
  75.9,
  77.9,
  78.9,
  79.9,
];

const milestones = [
  { quantity: 1, label: "Avulsa" },
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

function getPricing(count: number) {
  const total = pricesByQuantity[count] ?? pricesByQuantity[MAX_PHOTOS];
  const fullPrice = count * SINGLE_PHOTO_PRICE;
  const savings = Math.max(0, fullPrice - total);
  const discount = count ? Math.round((savings / fullPrice) * 100) : 0;
  const unitPrice = count ? total / count : 0;
  const nextMilestone = milestones.find((milestone) => milestone.quantity > count);

  return { total, fullPrice, savings, discount, unitPrice, nextMilestone };
}

function AddIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function Gallery({ token }: { token: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const pricing = useMemo(() => getPricing(selected.length), [selected.length]);
  const nextPrice = pricing.nextMilestone
    ? getPricing(pricing.nextMilestone.quantity)
    : null;
  const photosToNextDeal = pricing.nextMilestone
    ? pricing.nextMilestone.quantity - selected.length
    : 0;

  function togglePhoto(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((photoId) => photoId !== id)
        : [...current, id],
    );
  }

  function selectAll() {
    setSelected(samplePhotos.map((photo) => photo.id));
  }

  return (
    <main className="gallery-shell">
      <nav className="gallery-nav" aria-label="Galeria">
        <a className="brand" href="#top" aria-label="Home Studio">
          HOME <span>STUDIO</span>
        </a>
        <div className="nav-meta">
          <span className="status-dot" />
          Galeria pronta
        </div>
      </nav>

      <header className="gallery-header" id="top">
        <div className="gallery-intro">
          <span className="eyebrow">SEU ENSAIO EXCLUSIVO</span>
          <h1>Quais fotos contam melhor a sua história?</h1>
          <p>
            Toque nas suas favoritas. Quanto mais você escolher, menor fica o
            valor por foto. O melhor desconto é aplicado automaticamente.
          </p>
        </div>
        <div className="gallery-status">
          <span>{token === "demo" ? "Galeria demonstrativa" : "Sua galeria"}</span>
          <strong>20 fotos disponíveis</strong>
          <small>Alta resolução e sem marca d&apos;água após o pagamento</small>
        </div>
      </header>

      <section className="deal-section" aria-labelledby="deal-title">
        <div className="deal-heading">
          <div>
            <span className="section-kicker">DESCONTO PROGRESSIVO</span>
            <h2 id="deal-title">Você escolhe. O preço melhora.</h2>
          </div>
          <button className="text-button" onClick={selectAll} type="button">
            Quero todas
          </button>
        </div>

        <div className="milestone-track">
          {milestones.map((milestone) => {
            const milestonePricing = getPricing(milestone.quantity);
            const reached = selected.length >= milestone.quantity;
            const isNext = pricing.nextMilestone?.quantity === milestone.quantity;

            return (
              <div
                className={`milestone ${reached ? "reached" : ""} ${isNext ? "next" : ""}`}
                key={milestone.quantity}
              >
                {milestone.quantity === MAX_PHOTOS && (
                  <span className="best-value">Melhor valor</span>
                )}
                <span className="milestone-count">{milestone.quantity}</span>
                <span className="milestone-label">{milestone.label}</span>
                <strong>{money.format(milestonePricing.total)}</strong>
                <small>{money.format(milestonePricing.unitPrice)}/foto</small>
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
              {photosToNextDeal === 1 ? "foto" : "fotos"} e desbloqueie o pacote{" "}
              <strong>{pricing.nextMilestone.label}</strong>. Você leva{" "}
              {pricing.nextMilestone.quantity} por apenas{" "}
              <strong>{money.format(nextPrice.total - pricing.total)} a mais</strong>.
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
          <button className="text-button muted" onClick={() => setSelected([])} type="button">
            Limpar seleção
          </button>
        )}
      </div>

      <section className="photo-grid" aria-label="Fotos disponíveis">
        {samplePhotos.map((photo) => {
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
              <span className="watermark">HOME STUDIO</span>
              <span className="photo-number">
                Foto {String(photo.number).padStart(2, "0")}
              </span>
              <span className="checkmark">
                {isSelected ? (
                  <span className="selection-order">{selectionPosition + 1}</span>
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
            {selected.length > 0 && pricing.discount > 0 && (
              <strong className="discount-pill">-{pricing.discount}%</strong>
            )}
          </div>
          <div className="checkout-pricing">
            <strong>{money.format(pricing.total)}</strong>
            {selected.length > 0 && (
              <span>
                {money.format(pricing.unitPrice)}/foto
                {pricing.savings > 0 && <> · economia de {money.format(pricing.savings)}</>}
              </span>
            )}
          </div>
        </div>
        <button className="primary-button checkout-button" disabled={!selected.length} type="button">
          <span>{selected.length ? "Continuar para o Pix" : "Escolha suas fotos"}</span>
          {selected.length > 0 && <span aria-hidden="true">→</span>}
        </button>
      </aside>
    </main>
  );
}
