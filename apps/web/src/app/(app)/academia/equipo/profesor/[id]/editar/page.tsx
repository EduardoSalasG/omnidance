"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon, SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls, readError } from "@/components/academy/shared";

type PayType = "PER_CLASS" | "MONTHLY" | "COMMISSION";

/**
 * /academia/equipo/profesor/[id]/editar - acuerdo económico del
 * profesor (nivel 3): pago mensual por N clases, pago por clase o
 * comisión (% que la academia retiene de cada particular).
 */
export default function InstructorEditPage() {
  const t = useTranslations("academyStaff");
  const params = useParams<{ id: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader
        backHref={`/academia/equipo/profesor/${params.id}`}
        backLabel={t("instructorDetailTitle")}
      />
      <AcademyGate>
        {({ academy }) => (
          <EditAgreement
            key={`${academy.id}:${params.id}`}
            academyId={academy.id}
            personId={params.id}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function EditAgreement({
  academyId,
  personId,
}: {
  academyId: string;
  personId: string;
}) {
  const t = useTranslations("academyStaff");
  const tc = useTranslations("common");
  const router = useRouter();

  const [name, setName] = useState("");
  const [payType, setPayType] = useState<PayType | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payClasses, setPayClasses] = useState("");
  const [commissionPct, setCommissionPct] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    const res = await apiFetch(
      `/academies/${academyId}/instructors/${personId}`,
    ).catch(() => null);
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    const body = (await res.json()) as {
      person: { name: string | null; email: string | null };
      payType: PayType | null;
      payAmount: number | null;
      payClasses: number | null;
      commissionPct: number | null;
    };
    setName(body.person.name ?? body.person.email ?? "");
    setPayType(body.payType);
    setPayAmount(body.payAmount != null ? String(body.payAmount) : "");
    setPayClasses(body.payClasses != null ? String(body.payClasses) : "");
    setCommissionPct(
      body.commissionPct != null ? String(body.commissionPct) : "",
    );
    setLoaded(true);
  }, [academyId, personId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = payAmount.trim() === "" ? null : Number(payAmount);
    const classes = payClasses.trim() === "" ? null : Number(payClasses);
    const pct = commissionPct.trim() === "" ? null : Number(commissionPct);
    if (
      payType === "COMMISSION" &&
      (pct === null || !Number.isInteger(pct) || pct < 0 || pct > 100)
    ) {
      setErr(t("error"));
      return;
    }
    if (
      payType &&
      payType !== "COMMISSION" &&
      (amount === null || !Number.isInteger(amount) || amount < 0)
    ) {
      setErr(t("error"));
      return;
    }
    if (
      payType === "MONTHLY" &&
      (classes === null || !Number.isInteger(classes) || classes < 0)
    ) {
      setErr(t("error"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/instructors/${personId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            payType: payType ?? null,
            payAmount:
              payType === "PER_CLASS" || payType === "MONTHLY"
                ? amount
                : null,
            payClasses: payType === "MONTHLY" ? classes : null,
            commissionPct: payType === "COMMISSION" ? pct : null,
          }),
        },
      );
      if (!res.ok) {
        setErr((await readError(res)) ?? t("error"));
        return;
      }
      router.push(`/academia/equipo/profesor/${personId}`);
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
  if (!loaded) return <SkeletonList />;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("editAgreement")}
        </h2>
        {name && <p className="mt-1 text-xs text-ink/50">{name}</p>}
      </div>
      <form onSubmit={save} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs text-ink/50">{t("agreementLegend")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
            {([null, "MONTHLY", "PER_CLASS", "COMMISSION"] as const).map((k) => (
              <label
                key={k ?? "none"}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-center text-sm font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-neon ${
                  payType === k
                    ? "border-neon bg-neon/10 text-neon"
                    : "border-line text-ink/70 hover:border-neon/40"
                }`}
              >
                <input
                  type="radio"
                  name="pay-type"
                  checked={payType === k}
                  onChange={() => setPayType(k)}
                  className="sr-only"
                />
                {k === null
                  ? t("payTypeNone")
                  : k === "MONTHLY"
                    ? t("payMonthly")
                    : k === "PER_CLASS"
                      ? t("payPerClass")
                      : t("payCommission")}
              </label>
            ))}
          </div>
        </fieldset>
        {payType === "COMMISSION" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">
              {t("fieldCommissionPct")}
            </span>
            <input
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              required
              className={inputCls}
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
            />
          </label>
        )}
        {(payType === "PER_CLASS" || payType === "MONTHLY") && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">{t("fieldPayAmount")}</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              required
              className={inputCls}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </label>
        )}
        {payType === "MONTHLY" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">{t("fieldPayClasses")}</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              required
              className={inputCls}
              value={payClasses}
              onChange={(e) => setPayClasses(e.target.value)}
            />
          </label>
        )}
        {err && (
          <p role="alert" className="text-sm text-red-400">
            {err}
          </p>
        )}
        <div>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? t("adding") : t("saveAgreement")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
