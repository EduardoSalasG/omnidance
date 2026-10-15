"use client";

import { useLocale } from "next-intl";
import { getNumFmt } from "@/lib/intl";
const fmtCLP = (locale: string) => getNumFmt(locale, {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

type PriceTagProps = {
  /** Monto en CLP; null renderiza un guion (el caller decide si es "Gratis"). */
  amount: number | null;
  className?: string;
};

export function PriceTag({ amount, className = "" }: PriceTagProps) {
  const locale = useLocale();
  if (amount == null) {
    return <span className={`text-ink/50 ${className}`}>-</span>;
  }
  return (
    <span className={`font-semibold text-neon ${className}`}>
      {fmtCLP(locale).format(amount)}
    </span>
  );
}
