import type { HTMLAttributes } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Padding interno por defecto (p-5); desactivar para layouts custom. */
  padded?: boolean;
};

export function Card({ padded = true, className = "", ...rest }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-night-700 bg-night-900 ${
        padded ? "p-5" : ""
      } ${className}`}
      {...rest}
    />
  );
}
