export function normalizeBrazilianMobile(value?: string | null) {
  let digits = String(value ?? "").replace(/\D/g, "");

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  if (digits.length === 10) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }

  return digits.length === 11 ? digits : null;
}

export function formatBrazilianMobile(value?: string | null) {
  const digits = normalizeBrazilianMobile(value);
  if (!digits) return String(value ?? "");

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}