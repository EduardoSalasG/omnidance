"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon, SkeletonCard } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { inputCls, readError } from "@/components/producer/shared";

type AcademyOption = { id: string; name: string };

/**
 * /productor/eventos/[id]/academias/nueva - invita una academia a vender
 * la preventa del evento (POST /events/:id/academy-deals, spec
 * academy-presale-commission). El selector se alimenta del directorio
 * GET /academies (academias activas); el API valida que el owner tenga
 * rol aprobado y rechaza duplicados con mensaje propio.
 */
function NewAcademyDeal({ eventId }: { eventId: string }) {
  const t = useTranslations("academySales");
  const tp = useTranslations("producer");
  const tc = useTranslations("common");
  const router = useRouter();

  const [academies, setAcademies] = useState<AcademyOption[] | null>(null);
  const [academiesError, setAcademiesError] = useState(false);
  const [academyId, setAcademyId] = useState("");
  const [commissionPct, setCommissionPct] = useState("50");
  const [maxTickets, setMaxTickets] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const loadAcademies = useCallback(async () => {
    setAcademiesError(false);
    try {
      const res = await apiFetch("/academies");
      if (!res.ok) {
        setAcademiesError(true);
        return;
      }
      const rows = (await res.json()) as AcademyOption[];
      setAcademies(rows);
      if (rows.length > 0) setAcademyId((cur) => cur || rows[0].id);
    } catch {
      setAcademiesError(true);
    }
  }, []);

  useEffect(() => {
    void loadAcademies();
  }, [loadAcademies]);

  const pct = Number(commissionPct);
  const pctValid = Number.isInteger(pct) && pct >= 1 && pct <= 90;
  const cap = maxTickets.trim() === "" ? null : Number(maxTickets);
  const capValid = cap === null || (Number.isInteger(cap) && cap >= 1);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!academyId || !pctValid || !capValid || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await apiFetch(`/events/${eventId}/academy-deals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academyId,
          commissionPct: pct,
          ...(cap != null ? { maxTickets: cap } : {}),
        }),
      });
      if (!res.ok) {
        setFormError((await readError(res)) ?? tc("error"));
        return;
      }
      setCreated(true);
      setTimeout(() => router.push(`/productor/eventos/${eventId}`), 1200);
    } catch {
      setFormError(tc("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ConsoleHeader
        backHref={`/productor/eventos/${eventId}`}
        backLabel={tp("myEvents")}
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold leading-tight">{t("inviteTitle")}</h2>
        <p className="text-sm text-ink/60">{t("inviteDesc")}</p>

        {created && (
          <Card className="p-6 text-center">
            <p role="status" className="text-lg font-bold text-neon">
              {t("invited")}
            </p>
          </Card>
        )}

        {!created && academies === null && !academiesError && (
          <SkeletonCard lines={2} />
        )}
        {!created && academiesError && (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-red-400">
              {tc("error")}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void loadAcademies()}
            >
              <RefreshIcon /> {tc("retry")}
            </Button>
          </div>
        )}
        {!created && academies !== null && academies.length === 0 && (
          <p role="status" className="text-sm text-ink/50">
            {t("noAcademies")}
          </p>
        )}

        {!created && academies !== null && academies.length > 0 && (
          <Card>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm text-ink/70">
                  {t("academy")}
                  <span aria-hidden="true" className="text-neon"> *</span>
                </span>
                <select
                  required
                  value={academyId}
                  onChange={(e) => setAcademyId(e.target.value)}
                  className={inputCls}
                >
                  {academies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-ink/70">
                  {t("commissionPct")}
                  <span aria-hidden="true" className="text-neon"> *</span>
                </span>
                <input
                  type="number"
                  required
                  min={1}
                  max={90}
                  step={1}
                  inputMode="numeric"
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(e.target.value)}
                  className={inputCls}
                />
                <span className="text-xs text-ink/50">
                  {t("commissionPctHint")}
                </span>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-ink/70">{t("maxTickets")}</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={maxTickets}
                  onChange={(e) => setMaxTickets(e.target.value)}
                  className={inputCls}
                />
                <span className="text-xs text-ink/50">
                  {t("maxTicketsHint")}
                </span>
              </label>

              {formError && (
                <p role="alert" className="text-sm text-red-400">
                  {formError}
                </p>
              )}

              <Button
                type="submit"
                disabled={!academyId || !pctValid || !capValid || saving}
              >
                {saving ? tc("loading") : t("invite")}
              </Button>
            </form>
          </Card>
        )}
      </section>
    </>
  );
}

export default function NewAcademyDealPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-3xl lg:px-8">
      <ProducerGate>
        <NewAcademyDeal eventId={params.id} />
      </ProducerGate>
    </main>
  );
}
