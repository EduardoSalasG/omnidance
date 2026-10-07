"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import {
  ENROLLMENT_STATUSES,
  fromDateInput,
  inputCls,
  readError,
  type EnrollmentStatus,
  type MembershipPlan,
} from "./shared";

/**
 * Alta de enrollment - vive en la página dedicada /academia/alumnos/nuevo.
 * POST /academies/:id/enrollments {personId, planId, status, startsAt?,
 * endsAt?}. personId es FK plana → input de texto en v1. La página que la
 * hospeda resuelve canAdminister y fetchea los planes (el endpoint es
 * requireAdminister); sin planes no hay select posible → empty con CTA.
 */
export function EnrollmentForm({
  academyId,
  plans,
}: {
  academyId: string;
  plans: MembershipPlan[];
}) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const tp = useTranslations("practices");
  const router = useRouter();

  const [personId, setPersonId] = useState("");
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState<EnrollmentStatus>("ACTIVE");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Éxito breve antes de volver al listado (que refetchea al montar).
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const res = await apiFetch(`/academies/${academyId}/enrollments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: personId.trim(),
          planId,
          status,
          ...(startsAt ? { startsAt: fromDateInput(startsAt) } : {}),
          ...(endsAt ? { endsAt: fromDateInput(endsAt) } : {}),
        }),
      });
      if (!res.ok) {
        setFormError((await readError(res)) ?? tc("error"));
        return;
      }
      setSaved(true);
      setTimeout(() => router.push("/academia/alumnos"), 1200);
    } catch {
      setFormError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  if (plans.length === 0) {
    // Sin planes el select queda vacío: la salida es crear uno primero.
    return (
      <Card className="flex flex-col items-start gap-3">
        <p className="text-sm text-ink/60">{t("noPlansForEnrollment")}</p>
        <Button href="/academia/planes/nueva" size="sm" variant="secondary">
          + {t("newPlan")}
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      {saved ? (
        <p role="status" className="text-sm text-neon">
          {t("enrollmentSaved")}
        </p>
      ) : (
        <>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
            {t("newEnrollment")}
          </h2>
          <form
            onSubmit={submit}
            className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">
                {t("personId")}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                className={inputCls}
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">
                {t("plans")}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <select
                className={inputCls}
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                required
              >
                <option value="" disabled>
                  -
                </option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("students")}</span>
              <select
                className={inputCls}
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as EnrollmentStatus)
                }
              >
                {ENROLLMENT_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {t(`status.${st}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{tp("startsAt")}</span>
              <input
                className={inputCls}
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{tp("endsAt")}</span>
              <input
                className={inputCls}
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
            {formError && (
              <p role="alert" className="text-sm text-red-400 sm:col-span-2">
                {formError}
              </p>
            )}
            <div className="flex items-center gap-2 sm:col-span-2">
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? tc("loading") : tc("create")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => router.push("/academia/alumnos")}
              >
                {tc("cancel")}
              </Button>
            </div>
          </form>
        </>
      )}
    </Card>
  );
}
