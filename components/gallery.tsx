"use client";

import { useMemo, useState } from "react";

const samplePhotos = Array.from({ length: 20 }, (_, index) => ({
  id: `photo-${index + 1}`,
  number: index + 1,
  tone: (index * 19 + 8) % 360,
}));

const packagePrices: Record<number, number> = {
  1: 9.9,
  3: 24.9,
  5: 34.9,
  10: 59.9,
  20: 89.9,
};

function calculatePrice(count: number) {
  if (count === 0) return 0;
  const packageSize = [1, 3, 5, 10, 20].find((size) => count <= size) ?? 20;
  return packagePrices[packageSize];
}

export function Gallery({ token }: { token: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const total = useMemo(() => calculatePrice(selected.length), [selected.length]);

  function togglePhoto(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((photoId) => photoId !== id)
        : [...current, id],
    );
  }

  return (
    <main className="gallery-shell">
      <header className="gallery-header">
        <div>
          <span className="eyebrow">HOME STUDIO</span>
          <h1>Escolha as fotos que você amou.</h1>
          <p>
            Toque para selecionar. As fotos compradas serão liberadas sem marca
            d&apos;água e em alta resolução.
          </p>
        </div>
        <div className="gallery-status">
          <span>Sua galeria</span>
          <strong>{token === "demo" ? "Demonstração" : "Pronta"}</strong>
        </div>
      </header>

      <section className="photo-grid" aria-label="Fotos disponíveis">
        {samplePhotos.map((photo) => {
          const isSelected = selected.includes(photo.id);
          return (
            <button
              aria-pressed={isSelected}
              className={`photo-card ${isSelected ? "selected" : ""}`}
              key={photo.id}
              onClick={() => togglePhoto(photo.id)}
              type="button"
            >
              <span
                className="photo-placeholder"
                style={{
                  background: `linear-gradient(145deg, hsl(${photo.tone} 44% 28%), hsl(${photo.tone + 42} 55% 68%))`,
                }}
              />
              <span className="watermark">HOME STUDIO</span>
              <span className="photo-number">{String(photo.number).padStart(2, "0")}</span>
              <span className="checkmark">{isSelected ? "✓" : "+"}</span>
            </button>
          );
        })}
      </section>

      <aside className="checkout-bar">
        <div>
          <span>
            {selected.length === 0
              ? "Selecione suas favoritas"
              : `${selected.length} ${selected.length === 1 ? "foto selecionada" : "fotos selecionadas"}`}
          </span>
          <strong>{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
        </div>
        <button className="primary-button" disabled={!selected.length} type="button">
          Pagar com Pix
        </button>
      </aside>
    </main>
  );
}
