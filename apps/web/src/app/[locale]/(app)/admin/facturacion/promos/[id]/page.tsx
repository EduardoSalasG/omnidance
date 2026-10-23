"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, RefreshIcon, SkeletonList, Spinner } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { useDateFmt, useNumFmt } from "@/lib/intl";
import { readError } from "@/components/academy/shared";
import { PromoForm, type PromoPayload } from "@/components/admin/promo-form";

// Ficha de la promo (spec platform-promos): datos + edición + toggle
// enabled, patrón consola (sin delete - una promo apagada deja de
// aplicar y las subs vuelven a precio lleno al próximo ciclo).

type Promo = Omit<PromoPayload, "academies" | "producers" | "validFrom" | "validUntil" | "name"> & {
  id: string;
  name: string;
  academies: { id: string; name: string }[];
  producers: { id: string; name: string }[];
  subscriptionsCount: number;
  discountedPayments: number;
  validFrom: string;
  validUntil: string;
  createdBy: { id: string; name: string } | null;
};

export default function AdminPromoDetailPage(
  props: { params: Promise<{ id: string }> },
) {
  const { id } = use(props.params);
  const t = useTranslations("admin.promos");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/admin/facturacion/promos" backLabel={t("title")} />
      <AdminGate>
        <DetailPanel id={id} />
      </AdminGate>
    </main>
  );
}

function DetailPanel({ id }: { id: string }) {
  const t = useTranslations("admin.promos");
  const tc = useTranslations("common");
  const clp = useNumFmt({ style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  const dateFmt = useDateFmt({ dateStyle: "medium" });
  const [promo, setPromo] = useState<Promo | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    const res = await apiFetch(`/admin/platform-promos/${id}`).catch(() => null);
    if (!res?.ok) return setState("error");
    setPromo((await res.json()) as Promo);
    setState("ready");
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(body: Record<string, unknown>) {
    if (busy || !promo) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/admin/platform-promos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      setPromo((await res.json()) as Promo);
      setNotice({ text: t("saved"), error: false });
    } catch {
      setNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    if (!promo) return;
    await save({ enabled: !promo.enabled });
  }

  if (state === "loading") return <SkeletonList items={2} lines={2} />;
  if (state === "error" || !promo) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-red-400">
          {t("loadError")}
        </p>
        <Button size="sm" variant="ghost" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  const initial: PromoPayload = {
    name: promo.name,
    kind: promo.kind,
    discountType: promo.discountType,
    percentOff: promo.percentOff,
    amountOffClp: promo.amountOffClp,
    validFrom: promo.validFrom,
    validUntil: promo.validUntil,
    maxCycles: promo.maxCycles,
    enabled: promo.enabled,
    academies: promo.academies,
    producers: promo.producers,
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{promo.name}</h2>
        <Badge variant={promo.enabled ? "neon" : "muted"}>
          {promo.enabled ? t("enabledOn") : t("enabledOff")}
        </Badge>
      </div>

      <Card>
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-xs text-ink/50">{t("subsUsing")}</dt>
            <dd className="tabular-nums">{promo.subscriptionsCount}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-xs text-ink/50">{t("discountedPayments")}</dt>
            <dd className="tabular-nums">{promo.discountedPayments}</dd>
          </div>
          {promo.createdBy && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-ink/50">{t("createdBy")}</dt>
              <dd>{promo.createdBy.name}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-xs text-ink/50">{t("windowLabel")}</dt>
            <dd className="tabular-nums">
              {dateFmt.format(new Date(promo.validFrom))} →{" "}
              {dateFmt.format(new Date(promo.validUntil))}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <PromoForm
          key={promo.id + String(promo.enabled)}
          initial={initial}
          submitLabel={t("save")}
          onSubmit={save}
          busy={busy}
        />
      </Card>

      {/* Zona de acciones: habilitar/deshabilitar (nunca delete - el
          historial de cobros descontados queda auditado). */}
      <div className="flex flex-col items-center gap-2 border-t border-line pt-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void toggle()}
          className={promo.enabled ? "text-red-400 hover:text-red-300" : ""}
        >
          {busy && <Spinner size="sm" />}
          {promo.enabled ? t("disable") : t("enable")}
        </Button>
        <p className="text-center text-xs text-ink/40">{t("disableHint")}</p>
      </div>

      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={`text-sm ${notice.error ? "text-red-400" : "text-neon"}`}
        >
          {notice.text}
        </p>
      )}
    </section>
  );
}
