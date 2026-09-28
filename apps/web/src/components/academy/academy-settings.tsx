"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { inputCls, readError, type Academy } from "./shared";

type Me = { id: string; roles: string[] };

// GET /academies/:id (manage) — instructors incluye commissionPct desde
// role-console-polish; los nombres se resuelven via GET /academies
// (directorio autenticado).
type ManageInstructor = { personId: string; commissionPct: number | null };
type ManageDetail = { instructors?: ManageInstructor[] };
type DirectoryAcademy = {
  id: string;
  instructors?: { personId: string; name: string | null }[];
};

// Quórum por defecto cuando la academia no tiene uno configurado
// (Academy.defaultQuorum === null) — mismo fallback del backend.
const DEFAULT_QUORUM_FALLBACK = 20;

/**
 * Configuración de la academia — por ahora solo `defaultQuorum`
 * (PATCH /academies/:id/settings, owner/admin — el server responde 403
 * a instructores). Misma regla de visibilidad que videos.tsx:
 * ADMIN o me.id === academy.ownerId; sin sesión resuelta no se renderiza
 * (evita flash del card a instructores).
 */
export function AcademySettings({ academy }: { academy: Academy }) {
  const t = useTranslations("academy.settings");
  const tc = useTranslations("common");

  const [me, setMe] = useState<Me | null>(null);
  const [quorum, setQuorum] = useState(
    academy.defaultQuorum != null ? String(academy.defaultQuorum) : "",
  );
  // Valor efectivo mostrado ("Actual: N") — la prop academy no se
  // refetchea tras guardar, así que se actualiza localmente.
  const [current, setCurrent] = useState<number | null>(
    academy.defaultQuorum ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Comisión por instructor (PATCH /academies/:id/instructors/:personId).
  const [instructors, setInstructors] = useState<
    { personId: string; name: string | null; commissionPct: number | null }[]
  >([]);
  const [commissionDraft, setCommissionDraft] = useState<
    Record<string, string>
  >({});
  const [commissionBusy, setCommissionBusy] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/me")
      .then(async (res) => (res.ok ? ((await res.json()) as Me) : null))
      .then(setMe)
      .catch(() => {});
  }, []);

  const canAdministerNow =
    !!me && (me.roles.includes("ADMIN") || me.id === academy.ownerId);

  // Instructores + comisión — solo si ya sabemos que es owner/admin
  // (evita el fetch manage a instructores puros, que daría datos ajenos).
  useEffect(() => {
    if (!canAdministerNow) return;
    Promise.all([
      apiFetch(`/academies/${academy.id}`).then((r) =>
        r.ok ? (r.json() as Promise<ManageDetail>) : null,
      ),
      apiFetch("/academies").then((r) =>
        r.ok ? (r.json() as Promise<DirectoryAcademy[]>) : [],
      ),
    ])
      .then(([detail, directory]) => {
        const nameOf = new Map(
          (directory ?? [])
            .find((a) => a.id === academy.id)
            ?.instructors?.map((i) => [i.personId, i.name] as const) ?? [],
        );
        const rows = (detail?.instructors ?? []).map((i) => ({
          personId: i.personId,
          name: nameOf.get(i.personId) ?? null,
          commissionPct: i.commissionPct,
        }));
        setInstructors(rows);
        setCommissionDraft(
          Object.fromEntries(
            rows.map((r) => [r.personId, String(r.commissionPct ?? 0)]),
          ),
        );
      })
      .catch(() => {});
  }, [canAdministerNow, academy.id]);

  async function saveCommission(personId: string): Promise<void> {
    const raw = (commissionDraft[personId] ?? "").trim();
    const pct = raw === "" ? 0 : Number.parseInt(raw, 10);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      setError(t("saveError"));
      return;
    }
    setCommissionBusy(personId);
    setError(null);
    try {
      const res = await apiFetch(
        `/academies/${academy.id}/instructors/${personId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commissionPct: pct }),
        },
      );
      if (!res.ok) {
        setError((await readError(res)) ?? t("saveError"));
        return;
      }
      setInstructors((rows) =>
        rows.map((r) =>
          r.personId === personId ? { ...r, commissionPct: pct } : r,
        ),
      );
      setFeedback(t("commissionSaved"));
    } catch {
      setError(t("saveError"));
    } finally {
      setCommissionBusy(null);
    }
  }

  const canAdminister =
    !!me && (me.roles.includes("ADMIN") || me.id === academy.ownerId);
  if (!canAdminister) return null;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = quorum.trim();
    const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
    const next = parsed !== null && Number.isFinite(parsed) ? parsed : null;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiFetch(`/academies/${academy.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultQuorum: next }),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? t("saveError"));
        return;
      }
      setCurrent(next);
      setFeedback(t("saved"));
    } catch {
      setError(t("saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("title")}
      </h2>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50">{t("defaultQuorum")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className={`${inputCls} sm:max-w-40`}
            value={quorum}
            onChange={(e) => setQuorum(e.target.value)}
            placeholder={String(DEFAULT_QUORUM_FALLBACK)}
          />
          <span className="text-xs text-white/40">
            {t("defaultQuorumHint")}{" "}
            {t("defaultQuorumCurrent", {
              value: current ?? DEFAULT_QUORUM_FALLBACK,
            })}
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? tc("loading") : tc("save")}
          </Button>
          {feedback && (
            <p role="status" className="text-sm text-neon">
              {feedback}
            </p>
          )}
        </div>
      </form>

      {instructors.length > 0 && (
        <div className="mt-4 border-t border-night-700 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">
            {t("instructors")}
          </h3>
          <p className="mt-1 text-xs text-white/40">
            {t("instructorsHint")}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {instructors.map((i) => (
              <li
                key={i.personId}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {i.name ?? i.personId.slice(0, 8)}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  step={1}
                  aria-label={`${i.name ?? i.personId} %`}
                  className={`${inputCls} w-20`}
                  value={commissionDraft[i.personId] ?? "0"}
                  onChange={(e) =>
                    setCommissionDraft((d) => ({
                      ...d,
                      [i.personId]: e.target.value,
                    }))
                  }
                />
                <span className="text-xs text-white/40">%</span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={commissionBusy === i.personId}
                  onClick={() => void saveCommission(i.personId)}
                >
                  {tc("save")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
