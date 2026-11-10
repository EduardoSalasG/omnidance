"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";

import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  SkeletonList,
} from "@/components/ui";
import { Link } from "@/i18n/navigation";
import type { GatewayAccountView } from "@/components/payments/gateway-account";

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

// Tipo de cuenta bancaria chilena: select cerrado en el form de
// transferencia (spec academy-payment-claims). Se guarda el valor tal
// cual - son nombres de producto bancario, no copy traducible.
export const ACCOUNT_TYPE_OPTIONS = ["Vista", "Corriente", "Ahorro"] as const;

type Props = { academyId: string };

/**
 * Listado de medios de pago BYO del owner (spec academy-payment-claims):
 * cada card abre el detalle/edición en /configuracion/metodos-de-pago/[methodId];
 * el alta vive en /configuracion/metodos-de-pago/nuevo detrás del CTA. Los métodos
 * activos se muestran al alumno en la ficha de la academia.
 * La lista es unificada (change gateway-in-methods-form): la cuenta de
 * pasarela propia entra como primer card (badge pasarela + mask +
 * webhookUrl) y navega a la ficha /pasarela - el fetch va en paralelo
 * al de métodos y su fallo no rompe el listado.
 */
export function PaymentMethodsAdmin({ academyId }: Props) {
  const t = useTranslations("academyPay");
  const tc = useTranslations("common");

  const [methods, setMethods] = useState<Method[] | null>(null);
  const [gateway, setGateway] = useState<GatewayAccountView | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const [methodsRes, gatewayRes] = await Promise.all([
      apiFetch(`/academies/${academyId}/payment-methods/admin`).catch(
        () => null,
      ),
      apiFetch(`/academies/${academyId}/gateway-account`).catch(() => null),
    ]);
    if (!methodsRes?.ok) {
      setError(true);
      return;
    }
    setMethods((await methodsRes.json()) as Method[]);
    if (gatewayRes?.ok) {
      const body = (await gatewayRes.json()) as {
        account: GatewayAccountView | null;
      };
      setGateway(body.account);
    }
    // Gateway no-bloqueante: si el GET falla el card no se pinta y el
    // retry del listado re-dispara ambos fetches.
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="flex flex-col gap-4">
      {/* CTA primario a la derecha del título y encima de la
          descripción (review consola): flex-wrap lo deja caer a su
          línea en mobile sin comprimirse. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("methodsAdminTitle")}
        </h2>
        <Button
          size="sm"
          className="shrink-0 whitespace-nowrap"
          href="/academia/configuracion/metodos-de-pago/nuevo"
        >
          + {t("addMethod")}
        </Button>
      </div>
      <p className="-mt-2 text-xs text-ink/50">
        {t("methodsAdminDesc")}
      </p>

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
      ) : methods.length === 0 && !gateway ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink/50">{t("methodsEmpty")}</p>
          <Button
            variant="secondary"
            size="sm"
            href="/academia/configuracion/metodos-de-pago/nuevo"
          >
            + {t("addMethod")}
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {gateway && (
            <li>
              {/* Cuenta de pasarela en la misma colección (spec
                  payments/gateways): badge de tipo, mask, status y la
                  webhookUrl a pegar en el panel del provider. El detalle
                  de la URL se repite en la ficha /pasarela. */}
              <Link
                href="/academia/configuracion/metodos-de-pago/pasarela"
                className="flex min-h-11 flex-col gap-1 rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:border-neon/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                <span className="flex min-h-6 flex-wrap items-center gap-2">
                  <span className="font-medium">{gateway.provider}</span>
                  <Badge variant="outline">{t("fieldGateway")}</Badge>
                  <Badge
                    variant={
                      gateway.status === "ACTIVE" ? "neon" : "muted"
                    }
                  >
                    {gateway.status === "ACTIVE"
                      ? t("gateway.active")
                      : t("gateway.inactive")}
                  </Badge>
                  <ChevronRightIcon className="ml-auto h-4 w-4 shrink-0 text-ink/40" />
                </span>
                <span className="text-xs tabular-nums text-ink/50">
                  {gateway.keyMask}
                </span>
                <code className="break-all text-xs text-ink/40">
                  {gateway.webhookUrl}
                </code>
              </Link>
            </li>
          )}
          {methods.map((m) => (
            <li key={m.id}>
              <Link
                href={`/academia/configuracion/metodos-de-pago/${m.id}`}
                className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:border-neon/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                {/* Card completo clickeable → detalle/edición del medio
                    (activar/desactivar y eliminar viven en la ficha).
                    El chevron marca la navegabilidad donde no hay hover. */}
                <span className="font-medium">{m.label}</span>
                <Badge variant="outline">{t(TYPE_KEYS[m.type])}</Badge>
                {!m.active && <Badge variant="muted">{t("inactive")}</Badge>}
                <ChevronRightIcon className="ml-auto h-4 w-4 shrink-0 text-ink/40" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
