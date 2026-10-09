"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, RefreshIcon, SkeletonList, Spinner } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls, readError, type Academy } from "@/components/academy/shared";
import {
  TRANSFER_DETAIL_KEYS,
  TYPE_KEYS,
  type Method,
} from "@/components/academy/payment-methods-admin";

/**
 * /academia/configuracion/pagos/[methodId] - detalle/edición de un
 * medio de pago BYO (nivel 2): label, datos según tipo (transferencia =
 * datos de la cuenta), orden, activo/inactivo y eliminar.
 * PATCH/DELETE /academies/:id/payment-methods/:methodId.
 */
export default function PaymentMethodDetailPage() {
  const t = useTranslations("academyPay");
  const params = useParams<{ methodId: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader
        backHref="/academia/configuracion/pagos"
        backLabel={t("methodsAdminTitle")}
      />
      <AcademyGate>
        {({ academy }) => (
          <MethodDetail
            key={`${academy.id}:${params.methodId}`}
            academy={academy}
            methodId={params.methodId}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function MethodDetail({
  academy,
  methodId,
}: {
  academy: Academy;
  methodId: string;
}) {
  const t = useTranslations("academyPay");
  const tc = useTranslations("common");
  const router = useRouter();

  const [method, setMethod] = useState<Method | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Drafts del formulario.
  const [label, setLabel] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [order, setOrder] = useState("0");
  const [active, setActive] = useState(true);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    setNotFound(false);
    const res = await apiFetch(
      `/academies/${academy.id}/payment-methods/admin`,
    ).catch(() => null);
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    const list = (await res.json()) as Method[];
    const found = list.find((m) => m.id === methodId) ?? null;
    if (!found) {
      setNotFound(true);
      return;
    }
    setMethod(found);
    setLabel(found.label);
    setDetails(found.details ?? {});
    setOrder(String(found.order ?? 0));
    setActive(found.active);
    setErr(null);
    setSaved(false);
  }, [academy.id, methodId]);

  useEffect(() => {
    void load();
  }, [load]);

  function setDetail(k: string, v: string) {
    setDetails((d) => ({ ...d, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!method || busy || !label.trim()) return;
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      const res = await apiFetch(
        `/academies/${academy.id}/payment-methods/${method.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            label: label.trim(),
            details: Object.fromEntries(
              Object.entries(details).filter(([, v]) => v.trim()),
            ),
            order: Number(order) || 0,
            active,
          }),
        },
      );
      if (!res.ok) {
        setErr((await readError(res)) ?? t("error"));
        return;
      }
      setMethod((await res.json()) as Method);
      setSaved(true);
    } catch {
      setErr(t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!method || !window.confirm(t("deleteConfirm"))) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch(
        `/academies/${academy.id}/payment-methods/${method.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setErr((await readError(res)) ?? t("error"));
        return;
      }
      router.push("/academia/configuracion/pagos");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (notFound) {
    return <p className="text-sm text-ink/60">{t("methodNotFound")}</p>;
  }
  if (!method) return <SkeletonList />;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-lg font-semibold">{t("editMethod")}</h2>
          <Badge variant="outline">{t(TYPE_KEYS[method.type])}</Badge>
          {!method.active && <Badge variant="muted">{t("inactive")}</Badge>}
        </div>
        <Card className="p-4">
          <form onSubmit={save} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink/60">{t("fLabel")}</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("fLabelPh")}
                maxLength={60}
                required
                className={inputCls}
              />
            </label>
            {method.type === "TRANSFER" &&
              TRANSFER_DETAIL_KEYS.map(([key, i18n]) => (
                <label key={key} className="flex flex-col gap-1 text-sm">
                  <span className="text-ink/60">{t(i18n)}</span>
                  <input
                    value={details[key] ?? ""}
                    onChange={(e) => setDetail(key, e.target.value)}
                    className={inputCls}
                  />
                </label>
              ))}
            {method.type === "PAYMENT_LINK" && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink/60">{t("fUrl")}</span>
                <input
                  type="url"
                  value={details.url ?? ""}
                  onChange={(e) => setDetail("url", e.target.value)}
                  className={inputCls}
                />
              </label>
            )}
            {method.type === "CASH" && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink/60">{t("fInstructions")}</span>
                <input
                  value={details.instructions ?? ""}
                  onChange={(e) => setDetail("instructions", e.target.value)}
                  className={inputCls}
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink/60">{t("fOrder")}</span>
              <input
                type="number"
                inputMode="numeric"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
                className={`${inputCls} w-24`}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="size-4 accent-neon"
              />
              <span className="text-ink/70">{t("activeLabel")}</span>
            </label>
            {err && (
              <p role="alert" className="text-sm text-red-400">
                {err}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button type="submit" size="sm" disabled={!label.trim() || busy}>
                {busy ? <Spinner size="sm" /> : null}
                {t("save")}
              </Button>
              {saved && !err && (
                <p role="status" className="text-sm text-neon">
                  {t("methodSaved")}
                </p>
              )}
            </div>
          </form>
        </Card>
      </section>

      {/* Zona destructiva al pie, centrada y en rojo - mismo patrón que
          "Eliminar amigo" (/amigos/[id]). */}
      <div className="flex justify-center pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-red-400/80 transition-colors hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon disabled:opacity-50"
        >
          {busy ? <Spinner size="sm" /> : null}
          {t("remove")}
        </button>
      </div>
    </div>
  );
}
