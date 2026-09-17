"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { PartnerAvatar } from "@/components/sessions/PartnerAvatar";
import type { Me, PartnerRequest } from "./types";

const inputCls =
  "min-h-11 w-full rounded-xl border border-night-700 bg-night-800 px-4 py-3 " +
  "text-white placeholder:text-white/50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon";

type FeedState = "loading" | "ready" | "error";

type StyleOption = { id: string; name: string };

// Mismo patrón que notificaciones: fecha relativa es-CL.
const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
const dateFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
});

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((then - Date.now()) / 1000);
  const absSeconds = Math.abs(seconds);
  if (absSeconds < 60) return rtf.format(0, "second"); // "ahora"
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return rtf.format(days, "day");
  return dateFmt.format(new Date(then));
}

export type PartnerRequestsProps = {
  /** undefined = sesión aún cargando; null = sin sesión (GET /me → 401). */
  me: Me | null | undefined;
};

/**
 * Sección "Busco pareja de baile": composer colapsable (POST /partner-requests)
 * + feed público de solicitudes OPEN (GET /partner-requests) con cierre propio.
 */
export function PartnerRequests({ me }: PartnerRequestsProps) {
  const t = useTranslations("partnerRequests");
  const tc = useTranslations("common");
  const titleId = useId();

  const [state, setState] = useState<FeedState>("loading");
  const [items, setItems] = useState<PartnerRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  // La sesión pudo expirar entre /me y el POST — degrada a loginRequired.
  const [unauth, setUnauth] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(false);
  const [created, setCreated] = useState(false);

  // null = GET /styles no disponible → input libre (ver TODO abajo).
  const [styles, setStyles] = useState<StyleOption[] | null>(null);
  const [styleId, setStyleId] = useState("");
  const [styleText, setStyleText] = useState("");
  const [role, setRole] = useState<"" | "LEADER" | "FOLLOWER">("");
  const [level, setLevel] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const res = await apiFetch("/partner-requests").catch(() => null);
    if (!res || !res.ok) {
      setState("error");
      return;
    }
    setItems((await res.json()) as PartnerRequest[]);
    setState("ready");
  }, []);

  useEffect(() => {
    void load();
    // TODO(styles): GET /styles no existe hoy en el API (implementación en
    // paralelo). Si responde con una lista no vacía, el composer usa <select>
    // con ids reales; si no, queda input libre y el texto viaja como styleId.
    apiFetch("/styles")
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as unknown;
        if (Array.isArray(data) && data.length > 0) {
          setStyles(data as StyleOption[]);
        }
      })
      .catch(() => undefined);
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError(false);
    try {
      const res = await apiFetch("/partner-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // roleAny ("Cualquiera") = rol indistinto → se omite (campo opcional).
          // DanceRole del API es LEADER | FOLLOWER | SWITCH.
          styleId: (styles ? styleId : styleText) || undefined,
          role: role || undefined,
          level: level || undefined,
          location: location || undefined,
          note: note || undefined,
        }),
      });
      if (res.status === 401) {
        setUnauth(true);
        return;
      }
      if (!res.ok) {
        setFormError(true);
        return;
      }
      setCreated(true);
      setFormOpen(false);
      setStyleId("");
      setStyleText("");
      setRole("");
      setLevel("");
      setLocation("");
      setNote("");
      await load();
    } catch {
      setFormError(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function close(id: string) {
    setBusyId(id);
    const res = await apiFetch(`/partner-requests/${id}/close`, {
      method: "POST",
    }).catch(() => null);
    setBusyId(null);
    if (res?.status === 401) {
      setUnauth(true);
      return;
    }
    if (res?.ok) {
      setItems((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    await load();
  }

  const authed = !!me && !unauth;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2
          id={titleId}
          className="text-sm font-semibold uppercase tracking-wide text-white/50"
        >
          {t("title")}
        </h2>
        {authed && !formOpen && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            {t("compose")}
          </Button>
        )}
      </div>

      {created && (
        <p role="status" className="text-sm font-medium text-neon">
          {t("created")}
        </p>
      )}

      {/* Composer — requiere sesión; el feed es público */}
      {(me === null || unauth) && (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-sm text-white/60">{t("loginRequired")}</p>
          <Button href="/login" size="sm">
            {tc("login")}
          </Button>
        </Card>
      )}
      {authed && formOpen && (
        <Card>
          <form onSubmit={submit} className="flex flex-col gap-4">
            {styles ? (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-white/70">{t("styleLabel")}</span>
                <select
                  value={styleId}
                  onChange={(e) => setStyleId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">{t("styleLabel")}</option>
                  {styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-white/70">{t("styleLabel")}</span>
                {/* Sin catálogo público: texto libre enviado como styleId. */}
                <input
                  value={styleText}
                  onChange={(e) => setStyleText(e.target.value)}
                  className={inputCls}
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-white/70">{t("roleLabel")}</span>
              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as "" | "LEADER" | "FOLLOWER")
                }
                className={inputCls}
              >
                <option value="">{t("roleAny")}</option>
                <option value="LEADER">{t("roleLeader")}</option>
                <option value="FOLLOWER">{t("roleFollower")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-white/70">{t("levelLabel")}</span>
              <input
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-white/70">{t("locationLabel")}</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-white/70">{t("noteLabel")}</span>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={inputCls}
              />
            </label>
            {formError && (
              <p role="alert" className="text-sm text-red-400">
                {tc("error")}
              </p>
            )}
            <div className="flex gap-3">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? tc("loading") : t("submit")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setFormOpen(false)}
              >
                {tc("cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Feed de solicitudes OPEN — público */}
      {state === "loading" && <p className="text-white/50">{tc("loading")}</p>}
      {state === "error" && <p className="text-white/60">{tc("error")}</p>}
      {state === "ready" &&
        (items.length === 0 ? (
          <Card>
            <p className="text-white/60">{t("empty")}</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((r) => {
              const mine = !!me && me.id === r.person.id;
              const roleKey =
                r.role === "LEADER"
                  ? ("roleLeader" as const)
                  : r.role === "FOLLOWER"
                    ? ("roleFollower" as const)
                    : r.role === "SWITCH"
                      ? ("roleSwitch" as const)
                      : null;
              return (
                <li key={r.id}>
                  <Card>
                    <div className="flex items-center gap-3">
                      <PartnerAvatar
                        name={r.person.name}
                        photoUrl={r.person.photoUrl}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {r.person.name}
                        </p>
                        <p className="text-xs text-white/50">
                          {relativeTime(r.createdAt)}
                        </p>
                      </div>
                      {r.style?.name && (
                        <Badge variant="neon">{r.style.name}</Badge>
                      )}
                    </div>
                    {(roleKey || r.level || r.location) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {roleKey && (
                          <Badge variant="outline">{t(roleKey)}</Badge>
                        )}
                        {r.level && <Badge variant="muted">{r.level}</Badge>}
                        {r.location && (
                          <Badge variant="muted">{r.location}</Badge>
                        )}
                      </div>
                    )}
                    {r.note && (
                      <p className="mt-2 text-sm text-white/60">{r.note}</p>
                    )}
                    {mine && (
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <Badge variant="neon">{t("mine")}</Badge>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busyId === r.id}
                          onClick={() => void close(r.id)}
                        >
                          {t("close")}
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}
