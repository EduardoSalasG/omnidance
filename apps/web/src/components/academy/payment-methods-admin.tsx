"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { Badge, Button, Card, SkeletonList } from "@/components/ui";

export type Method = {
  id: string;
  type: "TRANSFER" | "PAYMENT_LINK" | "CASH";
  label: string;
  details: Record<string, string>;
  order: number;
  active: boolean;
};

export const TYPE_KEYS = {
  TRANSFER: "typeTransfer",
  PAYMENT_LINK: "typeLink",
  CASH: "typeCash",
} as const;

export const TRANSFER_DETAIL_KEYS = [
  ["bank", "fBank"],
  ["accountType", "fAccountType"],
  ["accountNumber", "fAccountNumber"],
  ["holder", "fHolder"],
  ["rut", "fRut"],
  ["email", "fEmail"],
] as const;

type Props = { academyId: string };

/**
 * Listado de medios de pago BYO del owner (spec academy-payment-claims):
 * cada card abre el detalle/edición en /configuracion/pagos/[methodId];
 * el alta vive en /configuracion/pagos/nuevo detrás del CTA. Los métodos
 * activos se muestran al alumno en la ficha de la academia.
 */
export function PaymentMethodsAdmin({ academyId }: Props) {
  const t = useTranslations("academyPay");
  const tc = useTranslations("common");

  const [methods, setMethods] = useState<Method[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const res = await apiFetch(
      `/academies/${academyId}/payment-methods/admin`,
    ).catch(() => null);
    if (!res?.ok) {
      setError(true);
      return;
    }
    setMethods((await res.json()) as Method[]);
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
            {t("methodsAdminTitle")}
          </h2>
          <p className="mt-1 text-xs text-ink/50">
            {t("methodsAdminDesc")}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          href="/academia/configuracion/pagos/nuevo"
        >
          + {t("addMethod")}
        </Button>
      </div>

      {error ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {tc("error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {tc("retry")}
          </Button>
        </div>
      ) : methods === null ? (
        <SkeletonList items={2} lines={1} />
      ) : methods.length === 0 ? (
        <p className="text-sm text-ink/50">{t("methodsEmpty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {methods.map((m) => (
            <li key={m.id}>
              <Link
                href={`/academia/configuracion/pagos/${m.id}`}
                className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:border-neon/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                {/* Card completo clickeable → detalle/edición del medio
                    (activar/desactivar y eliminar viven en la ficha). */}
                <span className="font-medium">{m.label}</span>
                <Badge variant="outline">{t(TYPE_KEYS[m.type])}</Badge>
                {!m.active && <Badge variant="muted">{t("inactive")}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
