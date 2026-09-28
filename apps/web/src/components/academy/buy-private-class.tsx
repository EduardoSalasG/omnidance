"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { readError } from "./shared";

/**
 * Compra de clase particular (spec private-lesson-product): POST
 * /checkout/private-class crea la orden PRIVATE y redirige a la pasarela;
 * el settle materializa la PrivateLesson "por asignar" al PAID (el owner
 * de la academia define fecha e instructor después del pago).
 */
export function BuyPrivateClass({ academyId }: { academyId: string }) {
  const t = useTranslations("academy.profile");
  const tc = useTranslations("common");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/checkout/private-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId }),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? tc("error"));
        return;
      }
      const order = (await res.json()) as { paymentUrl?: string };
      if (!order.paymentUrl) {
        setError(tc("error"));
        return;
      }
      window.location.assign(order.paymentUrl);
    } catch {
      setError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button className="w-full" disabled={busy} onClick={() => void buy()}>
        {t("buyPrivate")}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </>
  );
}
