"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { getDateFmt } from "@/lib/intl";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  SkeletonText,
  Spinner,
} from "@/components/ui";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";

// Shape de GET /me/sessions (spec auth-sessions): device ya llega
// parseado server-side ("iPhone · Safari"); current = la sesión de
// esta request (mismo jti del JWT).
type SessionRow = {
  id: string;
  device: string;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

/**
 * Card "Mis dispositivos" de /perfil (spec auth-sessions): sesiones
 * activas de la cuenta con revocación individual y "cerrar otras".
 * La sesión actual no se revoca acá (para eso está "Cerrar sesión").
 * Feedback por ActionNotice; confirmación destructiva por ConfirmSheet.
 */
export function SessionsCard() {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [busyOthers, setBusyOthers] = useState(false);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);

  const fmtDate = (iso: string) =>
    getDateFmt(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/me/sessions");
      if (!res.ok) throw new Error("fetch failed");
      const body = (await res.json()) as { sessions: SessionRow[] };
      setSessions(body.sessions);
      setFailed(false);
    } catch {
      setSessions([]);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await apiFetch(`/me/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setNotice({ text: t("sessions.error"), error: true });
        return;
      }
      setSessions((prev) => prev?.filter((s) => s.id !== id) ?? []);
      setNotice({ text: t("sessions.revoked") });
    } catch {
      setNotice({ text: t("sessions.error"), error: true });
    } finally {
      setBusyId(null);
    }
  }

  async function revokeOthers() {
    if (busyOthers) return;
    setBusyOthers(true);
    try {
      const res = await apiFetch("/me/sessions/revoke-others", {
        method: "POST",
      });
      if (!res.ok) {
        setNotice({ text: t("sessions.error"), error: true });
        return;
      }
      setConfirmOthers(false);
      await load();
      setNotice({ text: t("sessions.revokedOthers") });
    } catch {
      setNotice({ text: t("sessions.error"), error: true });
    } finally {
      setBusyOthers(false);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("sessions.title")}
      </h2>
      {sessions === null ? (
        /* Fetch en vuelo → skeleton con la forma de las filas (aparición
           diferida vía .page-loading en SkeletonText). */
        <SkeletonText lines={3} className="mt-3" />
      ) : failed ? (
        <div className="mt-3 flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-ink/60">
            {t("sessions.error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            {tc("retry")}
          </Button>
        </div>
      ) : sessions.length === 0 ? (
        <p className="mt-3 text-sm text-ink/60">{t("sessions.empty")}</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-line/60">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {s.device}
                    {s.current && (
                      <Badge variant="neon" className="ml-2 align-middle">
                        {t("sessions.current")}
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-ink/50">
                    {t("sessions.lastSeen", { date: fmtDate(s.lastSeenAt) })}
                  </p>
                </div>
                {!s.current && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId !== null}
                    onClick={() => void revoke(s.id)}
                    className="shrink-0 text-red-300 hover:text-red-200"
                  >
                    {busyId === s.id && <Spinner size="sm" />}
                    {t("sessions.revoke")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {sessions.length > 1 && (
            <div className="mt-3 flex justify-center border-t border-line/60 pt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmOthers(true)}
                className="text-red-300 hover:text-red-200"
              >
                {t("sessions.revokeOthers")}
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmSheet
        open={confirmOthers}
        title={t("sessions.revokeOthersConfirm")}
        confirmLabel={t("sessions.revokeOthersCta")}
        busy={busyOthers}
        onConfirm={() => void revokeOthers()}
        onClose={() => setConfirmOthers(false)}
      />
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </Card>
  );
}
