const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export type PriceTagProps = {
  /** Monto en CLP; null renderiza un guion (el caller decide si es "Gratis"). */
  amount: number | null;
  className?: string;
};

export function PriceTag({ amount, className = "" }: PriceTagProps) {
  if (amount == null) {
    return <span className={`text-white/50 ${className}`}>—</span>;
  }
  return (
    <span className={`font-semibold text-neon ${className}`}>
      {fmtCLP.format(amount)}
    </span>
  );
}
