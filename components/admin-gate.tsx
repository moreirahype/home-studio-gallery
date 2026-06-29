"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";

export function AdminGate({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { authenticated?: boolean }) => {
        setAuthenticated(Boolean(result.authenticated));
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false));
  }, []);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const response = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    setSubmitting(false);

    if (!response.ok || !result.ok) {
      setError(result.error ?? "Não foi possível entrar.");
      return;
    }

    setAuthenticated(true);
    setPassword("");
  }

  if (checking) {
    return (
      <main className="admin-gate-page">
        <p>Verificando acesso...</p>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="admin-gate-page">
        <form className="admin-gate-card" onSubmit={authenticate}>
          <span className="section-kicker">ÁREA ADMINISTRATIVA</span>
          <h1>Acesse as ferramentas da galeria</h1>
          <p>Use a mesma senha administrativa configurada na Vercel.</p>
          <label>
            Senha administrativa
            <input
              autoComplete="current-password"
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Entrando..." : "Entrar"}
          </button>
          {error && <p className="form-error">{error}</p>}
        </form>
      </main>
    );
  }

  return children;
}
