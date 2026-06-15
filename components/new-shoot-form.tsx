"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PwaInstall } from "@/components/pwa-install";

const themes = [
  "Profissional",
  "Luxo",
  "Casual",
  "Romântico",
  "Fitness",
  "Aniversário",
];

export function NewShootForm({ sourceToken }: { sourceToken?: string }) {
  const [theme, setTheme] = useState("");
  const [occasion, setOccasion] = useState("");
  const [style, setStyle] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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

    const formData = new FormData();
    formData.set("reference", imageFile);
    formData.set("theme", theme);
    formData.set("occasion", occasion);
    formData.set("styleNotes", style);
    if (sourceToken) formData.set("sourceToken", sourceToken);

    const response = await fetch("/api/repeat-shoots", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json()) as { ok: boolean; error?: string };

    if (!response.ok || !result.ok) {
      setError(result.error ?? "Não foi possível preparar o ensaio.");
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <main className="new-shoot-shell">
        <section className="new-shoot-card success-state">
          <span className="modal-badge success">Pedido preparado</span>
          <h1>Seu próximo ensaio começa aqui.</h1>
          <p>
            Na integração final, o pagamento de R$ 29,90 iniciará a geração de
            10 fotos completas e liberadas, sem nova seleção paga.
          </p>
          <PwaInstall />
          <button
            className="primary-button"
            onClick={() => setSubmitted(false)}
            type="button"
          >
            Criar outro tema
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
        <span className="eyebrow">10 FOTOS COMPLETAS POR R$ 29,90</span>
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
            <strong>10 fotos liberadas</strong>
            <span>Novo tema, sem mensalidade</span>
          </div>
          <strong>R$ 29,90</strong>
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
