"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function PwaInstall({ projectToken }: { projectToken?: string }) {
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setIsInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in navigator &&
          Boolean((navigator as Navigator & { standalone?: boolean }).standalone)),
    );

    navigator.serviceWorker?.register("/sw.js");

    function capturePrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", capturePrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", capturePrompt);
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setIsInstalled(true);
    setInstallPrompt(null);
  }

  async function enableNotifications() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey || !projectToken || !("Notification" in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectToken,
        subscription: subscription.toJSON(),
      }),
    });

    if (response.ok) setNotificationsEnabled(true);
  }

  if (isInstalled) {
    return (
      <div className="install-card compact">
        <strong>Home Studio instalado</strong>
        <span>Seus próximos ensaios ficam a um toque de distância.</span>
        {projectToken &&
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
          !notificationsEnabled && (
            <button
              className="primary-button"
              onClick={enableNotifications}
              type="button"
            >
              Ativar novidades
            </button>
          )}
        {notificationsEnabled && (
          <small>Notificações ativadas com sucesso.</small>
        )}
      </div>
    );
  }

  return (
    <div className="install-card">
      <span className="install-icon">HS</span>
      <div>
        <strong>Instale o Home Studio</strong>
        <p>
          Acesse seus ensaios como um aplicativo e receba novidades quando
          ativarmos as notificações.
        </p>
      </div>
      {installPrompt ? (
        <button className="primary-button" onClick={install} type="button">
          Instalar app
        </button>
      ) : isIos ? (
        <small>
          No iPhone: toque em Compartilhar e depois em “Adicionar à Tela de
          Início”.
        </small>
      ) : (
        <small>
          No Android: abra o menu do navegador e toque em “Instalar aplicativo”.
        </small>
      )}
    </div>
  );
}
