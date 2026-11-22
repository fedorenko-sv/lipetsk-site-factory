import type { ServicePrice } from "../../../shared/contracts.ts";

export function formatAmount(amountMinor: number): string {
  const hasKopecks = amountMinor % 100 !== 0;
  const value = amountMinor / 100;
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: hasKopecks ? 2 : 0,
    maximumFractionDigits: hasKopecks ? 2 : 0,
  }).format(value);
}

export function formatPrice(price: ServicePrice): string {
  const formatted = formatAmount(price.amountMinor);
  const prefix = price.kind === "from" ? "от " : "";
  return `${prefix}${formatted} ₽`;
}
