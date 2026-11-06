"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, ConfirmSheet, RefreshIcon, SkeletonList, Spinner } from "@/components/ui";
import {
  ActionNotice,
  showActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls, readError, type Academy } from "@/components/academy/shared";
import {
  TRANSFER_DETAIL_KEYS,
  ACCOUNT_TYPE_OPTIONS,
  TYPE_KEYS,
  type Method,
} from "@/components/academy/payment-methods-admin";
import { useRouter } from "@/i18n/navigation";

/**
 * /academia/configuracion/metodos-de-pago/[methodId] - detalle/edición de un
 * medio de pago BYO (nivel 2): label, datos según tipo (transferencia =
 * datos de la cuenta), orden, activo/inactivo y eliminar.
 * PATCH/DELETE /academies/:id/payment-methods/:methodId.
 */
export default function PaymentMethodDetailPage() {
  const t = useTranslations("academyPay");
  const params = useParams<{ methodId: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader
        backHref="/academia/configuracion/metodos-de-pago"
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
  const [active, setActive] = useState(true);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    setActive(found.active);
    setNotice(null);
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
    setNotice(null);
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
            active,
          }),
        },
      );
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      setMethod((await res.json()) as Method);
      setNotice({ text: t("methodSaved") });
    } catch {
      setNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!method) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(
        `/academies/${academy.id}/payment-methods/${method.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setConfirmDelete(false);
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      // Aviso global: la navegación desmonta esta página, el host del
      // layout lo muestra en el listado destino.
      showActionNotice({ text: t("methodDeleted") });
      router.push("/academia/configuracion/metodos-de-pago");
    } catch {
      setConfirmDelete(false);
      setNotice({ text: t("error"), error: true });
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
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-ink/60">{t("methodNotFound")}</p>
        <Button
          variant="secondary"
          size="sm"
          href="/academia/configuracion/metodos-de-pago"
        >
          {tc("back")}
        </Button>
      </div>
    );
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
                  {key === "accountType" ? (
                    <select
                      value={details[key] ?? ""}
                      onChange={(e) => setDetail(key, e.target.value)}
                      className={inputCls}
                    >
                      <option value=""></option>
                      {ACCOUNT_TYPE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                      {/* Valores legacy de texto libre: se conservan
                          para no perder el dato al editar. */}
                      {details[key] &&
                        !(ACCOUNT_TYPE_OPTIONS as readonly string[]).includes(
                          details[key],
                        ) && (
                          <option value={details[key]}>{details[key]}</option>
                        )}
                    </select>
                  ) : (
                    <input
                      value={details[key] ?? ""}
                      onChange={(e) => setDetail(key, e.target.value)}
                      className={inputCls}
                    />
                  )}
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
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="size-4 accent-neon"
              />
              <span className="text-ink/70">{t("activeLabel")}</span>
            </label>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button type="submit" size="sm" disabled={!label.trim() || busy}>
                {busy ? <Spinner size="sm" /> : null}
                {t("save")}
              </Button>
            </div>
          </form>
        </Card>
      </section>

      {/* Zona destructiva al pie (console-patterns §4): div centrado
          separado por border-t, ghost rojo + ConfirmSheet. */}
      <div className="flex justify-center border-t border-line pt-6">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
          className="text-red-400 hover:text-red-300"
        >
          {t("remove")}
        </Button>
      </div>

      <ConfirmSheet
        open={confirmDelete}
        title={t("deleteConfirm")}
        confirmLabel={t("remove")}
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setConfirmDelete(false)}
      />

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}
