"use client";

import { useLocale } from "next-intl";
import { formatMoney } from "@/lib/intl";

type PriceTagProps = {
  /** Monto en unidad menor; null renderiza un guion (el caller decide si es "Gratis"). */
  amount: number | null;
  /** ISO-4217 (spec multipais-currency); default CLP. No-CLP muestra el código. */
  currency?: string;
  className?: string;
};

export function PriceTag({ amount, currency, className = "" }: PriceTagProps) {
  const locale = useLocale();
  if (amount == null) {
    return <span className={`text-ink/50 ${className}`}>-</span>;
  }
  return (
    <span className={`font-semibold text-neon ${className}`}>
      {formatMoney(amount, currency ?? "CLP", locale)}
    </span>
  );
}
