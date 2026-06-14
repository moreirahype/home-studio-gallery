"use client";

import { useMemo, useState } from "react";

const MAX_PHOTOS = 20;
const ENTRY_PRICE = 4.9;

const samplePhotos = Array.from({ length: MAX_PHOTOS }, (_, index) => ({
  id: `photo-${index + 1}`,
  number: index + 1,
  tone: (index * 19 + 8) % 360,
}));

const pricesByQuantity = [
  0,
  4.9,
  8.9,
  11.9,
  14.9,
  17.9,
  20.9,
  23.9,
  26.9,
  28.9,
  29.9,
  32.9,
  34.9,
  36.9,
  38.9,
  39.9,
  42.9,
  44.9,
  46.9,
  48.9,
  49.9,
];

const milestones = [
  { quantity: 1, label: "Já incluída" },
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
  const fullPrice = count * ENTRY_PRICE;
  const savings = Math.max(0, fullPrice - total);
  const discount = count ? Math.round((savings / fullPrice) * 100) : 0;
  const unitPrice = count ? total / count : 0;
  const dueNow = count ? Math.max(0, total - ENTRY_PRICE) : 0;
  const nextMilestone = milestones.find((milestone) => milestone.quantity > count);

  return { total, fullPrice, savings, discount, unitPrice, dueNow, nextMilestone };
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
            valor por foto. A primeira já está incluída nos R$ 4,90 que você
            pagou.
          </p>
        </div>
        <div className="gallery-status">
          <span>{token === "demo" ? "Galeria demonstrativa" : "Sua galeria"}</span>
          <strong>20 fotos disponíveis</strong>
          <small>Escolha uma incluída ou monte seu pacote com desconto</small>
        </div>
      </header>

      <section className="deal-section" aria-labelledby="deal-title">
        <div className="deal-heading">
          <div>
            <span className="section-kicker">DESCONTO PROGRESSIVO</span>
            <h2 id="deal-title">Sua primeira foto já está garantida.</h2>
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
                <small>
                  {milestone.quantity === 1
                    ? "paga na entrada"
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
              {photosToNextDeal === 1 ? "foto" : "fotos"} e desbloqueie o pacote{" "}
              <strong>{pricing.nextMilestone.label}</strong>. Você leva{" "}
              {pricing.nextMilestone.quantity} por apenas{" "}
              <strong>{money.format(nextPrice.dueNow - pricing.dueNow)} a mais</strong>.
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
            <strong>
              {selected.length === 1 ? "Incluída" : money.format(pricing.dueNow)}
            </strong>
            {selected.length > 0 && (
              <span>
                {selected.length === 1 ? (
                  <>Você já pagou R$ 4,90</>
                ) : (
                  <>
                    Total {money.format(pricing.total)} · R$ 4,90 já pagos
                  </>
                )}
              </span>
            )}
          </div>
        </div>
        <button className="primary-button checkout-button" disabled={!selected.length} type="button">
          <span>
            {selected.length === 1
              ? "Baixar foto incluída"
              : selected.length > 1
                ? "Pagar adicionais no Pix"
                : "Escolha suas fotos"}
          </span>
          {selected.length > 0 && <span aria-hidden="true">→</span>}
        </button>
      </aside>
    </main>
  );
}
