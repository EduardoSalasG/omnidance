"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ConfirmSheet } from "@/components/ui";
import { Link, useRouter } from "@/i18n/navigation";

/**
 * CTA "Conseguir entrada" del detalle de evento.
 * Si el usuario ya tiene una entrada ACTIVE para el evento (hasTicket),
 * intercepta el click y pide confirmación antes de abrir el checkout:
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
  const router = useRouter();
  const [open, setOpen] = useState(false);

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
      <ConfirmSheet
        open={open}
        title={t("alreadyTicket")}
        description={t("alreadyTicketDesc")}
        confirmLabel={t("buyAnother")}
        confirmVariant="primary"
        onConfirm={() => router.push(href)}
        onClose={() => setOpen(false)}
      >
        <p className="mt-4 text-center">
          <Link
            href="/qr"
            className="text-xs text-ink/50 underline-offset-2 hover:text-ink/80 hover:underline"
          >
            {t("alreadyTicketQrHint")}
          </Link>
        </p>
      </ConfirmSheet>
    </>
  );
}
