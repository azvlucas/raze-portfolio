type DecimalLike = number | string | { toString(): string } | null | undefined;

export function toNumber(value: DecimalLike): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return Number(value.toString()) || 0;
}

export function formatBRL(value: DecimalLike): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(toNumber(value));
}

export function calcMarginPercent(cost: DecimalLike, sale: DecimalLike): number {
  const s = toNumber(sale);
  const c = toNumber(cost);
  if (s <= 0) return 0;
  return ((s - c) / s) * 100;
}

/** Alias used by product UI — same as calcMarginPercent */
export function marginPercent(cost: DecimalLike, sale: DecimalLike): number {
  return calcMarginPercent(cost, sale);
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Preço de venda a partir do custo e markup % */
export function salePriceFromMarkup(cost: number, markupPercent: number): number {
  if (cost <= 0) return 0;
  return roundMoney(cost * (1 + markupPercent / 100));
}

/** Markup % a partir do custo e preço de venda */
export function markupFromPrices(cost: number, sale: number): number {
  if (cost <= 0) return 0;
  return roundMoney(((sale - cost) / cost) * 100);
}
