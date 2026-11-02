import type { HTMLAttributes } from "react";

export type BadgeVariant =
  | "neon"
  | "muted"
  | "outline"
  | "live"
  | "warn"
  | "success";

const variants: Record<BadgeVariant, string> = {
  neon: "bg-neon/15 text-neon",
  muted: "bg-elevated text-ink/70",
  outline: "border border-line text-ink/70",
  live: "bg-red-500/15 text-red-400",
  warn: "bg-warn/15 text-warn",
  success: "bg-emerald-500/15 text-emerald-300",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
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
