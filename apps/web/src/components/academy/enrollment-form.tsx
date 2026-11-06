"use client";

import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import {
  ENROLLMENT_STATUSES,
  fromDateInput,
  inputCls,
  readError,
  suggestedEndsAt,
  type EnrollmentStatus,
  type MembershipPlan,
  type PersonCandidate,
} from "./shared";
import { useRouter } from "@/i18n/navigation";

/**
 * Alta de enrollment - vive en la página dedicada /academia/alumnos/nuevo.
 * POST /academies/:id/enrollments {personId, planId, status, startsAt?,
 * endsAt?}. La persona se resuelve por buscador con debounce contra
 * /students/candidates (el personId nunca se tipea); "pagado hasta" se
 * sugiere por la duración del plan y queda editable. La página que la
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

  // Buscador de persona (mismo patrón que /productor/eventos/[id]/staff/
  // nuevo): query libre → candidatos → selección fija el personId.
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PersonCandidate | null>(null);
  const [candidates, setCandidates] = useState<PersonCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState<EnrollmentStatus>("ACTIVE");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  // endsAt editado a mano = override: el cambio de plan/inicio ya no lo
  // re-sugiere (spec academies/console-lists).
  const [endsTouched, setEndsTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  // Búsqueda con debounce 300ms: solo corre con ≥2 chars y sin selección.
  useEffect(() => {
    const term = query.trim();
    if (selected || term.length < 2) {
      setCandidates(null);
      setSearching(false);
      setSearchError(false);
      return;
    }
    setSearching(true);
    setSearchError(false);
    const timer = setTimeout(() => {
      apiFetch(
        `/academies/${academyId}/students/candidates?q=${encodeURIComponent(term)}`,
      )
        .then(async (res) => {
          if (res.ok) {
            setCandidates((await res.json()) as PersonCandidate[]);
          } else {
            setCandidates(null);
            setSearchError(true);
          }
        })
        .catch(() => {
          setCandidates(null);
          setSearchError(true);
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, academyId, selected]);

  // Sugerencia de vigencia por duración del plan (espejo de
  // membershipEndsAt del dominio, en fechas del input). Solo corre
  // mientras el campo siga sin edición manual.
  useEffect(() => {
    if (endsTouched) return;
    const plan = plans.find((p) => p.id === planId);
    setEndsAt(plan ? suggestedEndsAt(plan, startsAt) : "");
  }, [planId, startsAt, endsTouched, plans]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/academies/${academyId}/enrollments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: selected.id,
          planId,
          status,
          ...(startsAt ? { startsAt: fromDateInput(startsAt) } : {}),
          ...(endsAt ? { endsAt: fromDateInput(endsAt) } : {}),
        }),
      });
      if (!res.ok) {
        showActionNotice({ text: (await readError(res)) ?? tc("error"), error: true });
        return;
      }
      showActionNotice({ text: t("enrollmentSaved") });
      router.push("/academia/alumnos");
    } catch {
      showActionNotice({ text: tc("error"), error: true });
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("newEnrollment")}
      </h2>
      <form
        onSubmit={submit}
        className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {selected ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-elevated px-3 py-2 sm:col-span-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {selected.name ?? selected.email ?? selected.id}
              </p>
              {selected.name && selected.email && (
                <p className="truncate text-xs text-ink/50">
                  {selected.email}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setQuery("");
              }}
              className="min-h-9 shrink-0 rounded px-2 text-xs text-neon hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              {t("personSearch.change")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">
                {t("personSearch.label")}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                type="text"
                required
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("personSearch.placeholder")}
                className={inputCls}
              />
            </label>
            <div aria-live="polite">
              {searching && (
                <p role="status" className="text-xs text-ink/50">
                  {tc("loading")}
                </p>
              )}
              {!searching && searchError && (
                <p role="alert" className="text-xs text-red-400">
                  {tc("error")}
                </p>
              )}
              {!searching &&
                !searchError &&
                candidates !== null &&
                candidates.length === 0 && (
                  <p role="status" className="text-xs text-ink/50">
                    {t("personSearch.noResults")}
                  </p>
                )}
            </div>
            {candidates !== null && candidates.length > 0 && (
              <ul className="flex flex-col gap-1" role="listbox">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(c);
                        setCandidates(null);
                      }}
                      className="flex min-h-11 w-full flex-col justify-center rounded-lg border border-ink/10 bg-canvas px-3 py-2 text-left hover:border-neon/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                    >
                      <span className="truncate text-sm font-medium">
                        {c.name ?? c.email ?? c.id}
                      </span>
                      {c.name && c.email && (
                        <span className="truncate text-xs text-ink/50">
                          {c.email}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
          <span className="text-xs text-ink/50">
            {t("studentProfile.enrollmentStatus")}
          </span>
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
            onChange={(e) => {
              setEndsAt(e.target.value);
              setEndsTouched(true);
            }}
          />
        </label>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" size="sm" disabled={busy || !selected}>
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
    </Card>
  );
}
