"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card } from "@/components/ui";
import { useDialogFocus } from "@/lib/useDialogFocus";

/**
 * CTA "Conseguir entrada" del detalle de evento.
 * Si el usuario ya tiene una entrada ACTIVE para el evento (hasTicket),
 * intercepta el click y pide confirmación antes de abrir el checkout —
 * el caso real es que quiere su QR, no pagar dos veces.
 */
export function BuyTicketCta({
  href,
  hasTicket,
  label,
}: {
  href: string;
  hasTicket: boolean;
  label: string;
}) {
  const t = useTranslations("events");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const dialogRef = useDialogFocus<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!hasTicket) {
    return (
      <Button href={href} size="lg" className="shrink-0">
        {label}
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="shrink-0"
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open && (
        <div
          ref={dialogRef}
          role="presentation"
          className="fixed inset-0 z-50 flex items-end justify-center bg-night-950/80 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="dup-ticket-title"
            className="w-full max-w-md space-y-4"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <h2 id="dup-ticket-title" className="text-lg font-semibold">
              {t("alreadyTicket")}
            </h2>
            <p className="text-sm text-white/70">{t("alreadyTicketDesc")}</p>
            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                {tc("cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => router.push(href)}
              >
                {t("buyAnother")}
              </Button>
            </div>
            <p className="text-center">
              <Link
                href="/qr"
                className="text-xs text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
              >
                {t("alreadyTicketQrHint")}
              </Link>
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
