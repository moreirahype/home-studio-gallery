function parseExtraPhotoPricing(
  value: unknown,
  unit: "reais" | "cents",
) {
  if (!value) return null;
  const source =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return null;
          }
        })()
      : value;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }

  const entries = Object.entries(source as Record<string, unknown>)
    .map(([key, amount]) => {
      const quantity = Number(key);
      const valueNumber =
        typeof amount === "number"
          ? amount
          : typeof amount === "string"
            ? Number(amount.replace(",", "."))
            : NaN;

      if (!Number.isFinite(quantity) || !Number.isFinite(valueNumber)) return null;
      const amountCents =
        unit === "cents" ? Math.round(valueNumber) : Math.round(valueNumber * 100);
      return [Math.round(quantity), amountCents] as const;
    })
    .filter((entry): entry is readonly [number, number] => Boolean(entry));

  return entries.length ? Object.fromEntries(entries) : null;
}

export function parseExtraPhotoPricingCents(value: unknown) {
  return parseExtraPhotoPricing(value, "reais");
}

export function parseStoredExtraPhotoPricingCents(value: unknown) {
  return parseExtraPhotoPricing(value, "cents");
}

export function extraPhotoPricingCentsToReais(
  value: Record<number, number> | null,
) {
  return value
    ? Object.fromEntries(
        Object.entries(value).map(([quantity, amountCents]) => [
          Number(quantity),
          amountCents / 100,
        ]),
      )
    : null;
}
