declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function trackBrowserPurchase({
  paymentId,
  orderId,
  value,
}: {
  paymentId: string;
  orderId: string;
  value: number;
}) {
  if (typeof window === "undefined" || !window.fbq || value <= 0) return;

  window.fbq(
    "track",
    "Purchase",
    { value: Number(value.toFixed(2)), currency: "BRL" },
    { eventID: `mp-${paymentId}-${orderId}` },
  );
}
