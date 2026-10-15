"use client";

import { useTranslations } from "next-intl";
import { useDialogFocus } from "@/lib/useDialogFocus";
import { Button } from "./Button";
import { Card } from "./Card";

/**
 * Confirmación de acción destructiva/irreversible - bottom-sheet en
 * mobile, modal centrado en ≥sm (reemplaza window.confirm: focus trap
 * + Escape + backdrop click + restauración de foco vía useDialogFocus).
 * Uso: state de apertura en la página + onConfirm async.
 */
export function ConfirmSheet({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  /** Texto de apoyo - suele llevar el nombre del recurso afectado. */
  description?: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const tc = useTranslations("common");
  const dialogRef = useDialogFocus<HTMLDivElement>(open, onClose);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="presentation"
      className="fixed inset-0 z-50 flex items-end justify-center bg-canvas/80 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-sheet-title"
        className="w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-sheet-title" className="text-lg font-semibold">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-ink/60">{description}</p>
        )}
        <div className="mt-4 flex gap-3">
          <Button
            type="button"
            className="flex-1 bg-red-500 hover:bg-red-400"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? tc("loading") : confirmLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
