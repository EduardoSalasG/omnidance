import type { HTMLAttributes } from "react";

export type BadgeVariant = "neon" | "muted" | "outline" | "live";

const variants: Record<BadgeVariant, string> = {
  neon: "bg-neon/15 text-neon",
  muted: "bg-night-800 text-white/70",
  outline: "border border-night-700 text-white/70",
  live: "bg-red-500/15 text-red-400",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

/** Chip pequeño para series, estilos de baile y estados. */
export function Badge({
  variant = "muted",
  className = "",
  ...rest
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${variants[variant]} ${className}`}
      {...rest}
    />
  );
}
