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
  SkeletonList,
  Spinner,
} from "@/components/ui";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import { readError } from "@/components/academy/shared";

// Shape de GET /admin/users/:personId/sessions (spec auth-sessions):
// device ya parseado server-side; revoked distingue filas muertas.
export type AdminSessionRow = {
  id: string;
  device: string;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  revoked: boolean;
};

/**
 * Sección Sesiones de la ficha admin /admin/usuarios/[personId] (spec
 * auth-sessions): lista las sesiones recientes de la persona y permite
 * revocar individual o todas (revoke-all mata también la vigente - es
 * el punto de corte ante cuenta comprometida). Fetch independiente del
 * detail: un fallo acá no tumba la ficha (mismo criterio que timeline).
 */
export function UserSessionsSection({ personId }: { personId: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [sessions, setSessions] = useState<AdminSessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);

  const fmtDate = (iso: string) =>
    getDateFmt(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/admin/users/${personId}/sessions`);
      if (!res.ok) throw new Error("fetch failed");
      const body = (await res.json()) as { sessions: AdminSessionRow[] };
      setSessions(body.sessions);
      setFailed(false);
    } catch {
      setSessions([]);
      setFailed(true);
    }
  }, [personId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await apiFetch(`/admin/sessions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setNotice({
          text: (await readError(res)) ?? tc("error"),
          error: true,
        });
        return;
      }
      await load();
      setNotice({ text: t("users.sessions.revokedOne") });
    } catch {
      setNotice({ text: tc("error"), error: true });
    } finally {
      setBusyId(null);
    }
  }

  async function revokeAll() {
    if (busyAll) return;
    setBusyAll(true);
    try {
      const res = await apiFetch(
        `/admin/users/${personId}/sessions/revoke-all`,
        { method: "POST" },
      );
      if (!res.ok) {
        setNotice({
          text: (await readError(res)) ?? tc("error"),
          error: true,
        });
        return;
      }
      const body = (await res.json()) as { revoked?: number };
      setConfirmAll(false);
      await load();
      setNotice({
        text: t("users.sessions.revokedAll", {
          count: body.revoked ?? 0,
        }),
      });
    } catch {
      setNotice({ text: tc("error"), error: true });
    } finally {
      setBusyAll(false);
    }
  }

  const active = sessions?.filter((s) => !s.revoked).length ?? 0;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="sessions-h">
      <h2
        id="sessions-h"
        className="text-sm font-semibold uppercase tracking-wide text-ink/50"
      >
        {t("users.sessions.title")}
      </h2>
      {sessions === null ? (
        <SkeletonList />
      ) : failed ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-ink/60">
            {t("users.sessions.error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            {tc("retry")}
          </Button>
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-ink/50">{t("users.sessions.empty")}</p>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line/60">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {s.device}
                    <Badge
                      variant={s.revoked ? "muted" : "neon"}
                      className="ml-2 align-middle"
                    >
                      {s.revoked
                        ? t("users.sessions.revoked")
                        : t("users.sessions.active")}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-ink/50">
                    {t("users.sessions.lastSeen", {
                      date: fmtDate(s.lastSeenAt),
                    })}
                    {s.ip ? ` · ${s.ip}` : ""}
                  </p>
                </div>
                {!s.revoked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId !== null}
                    onClick={() => void revoke(s.id)}
                    className="shrink-0 text-red-300 hover:text-red-200"
                  >
                    {busyId === s.id && <Spinner size="sm" />}
                    {t("users.sessions.revoke")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {active > 0 && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setConfirmAll(true)}
          className="self-start border-red-500/50 text-red-300 hover:bg-red-500/10"
        >
          {t("users.sessions.revokeAll")}
        </Button>
      )}

      <ConfirmSheet
        open={confirmAll}
        title={t("users.sessions.revokeAllConfirm")}
        confirmLabel={t("users.sessions.revokeAllCta")}
        busy={busyAll}
        onConfirm={() => void revokeAll()}
        onClose={() => setConfirmAll(false)}
      />
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </section>
  );
}
