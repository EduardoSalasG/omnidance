"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import { Link } from "@/i18n/navigation";

type Checks = Record<"name" | "emailVerified" | "phone" | "actorData", boolean>;
type Row = { role: string; checks: Checks; complete: boolean };

const CHECK_KEYS = ["name", "emailVerified", "phone", "actorData"] as const;

// A dónde va cada check faltante (emailVerified se resuelve inline).
const CHECK_HREF: Partial<Record<(typeof CHECK_KEYS)[number], string>> = {
  name: "/perfil/datos",
  phone: "/perfil/datos",
};

const ACTOR_HREF: Record<string, string> = {
  ACADEMY_OWNER: "/academia",
  PRODUCER: "/productor",
};

/**
 * Card de rol en revisión (spec rbac): muestra al actor con PersonRole
 * PENDING (ACADEMY_OWNER/PRODUCER) el mismo checklist que evalúa el
 * admin - cada ítem faltante enlaza a la acción que lo resuelve. El
 * email se verifica inline vía el correo de acceso (link+OTP).
 * Se oculta cuando no hay roles pendientes de validación.
 */
export function PendingRoleCard() {
  const t = useTranslations("roleReview");
  const { me, refresh } = useMe();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Aviso post-acción local: tras verificar el OTP el checklist se
  // re-evalúa en background, el aviso confirma el éxito al momento.
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);

  const pendingRoles = (me?.roleStates ?? []).filter(
    (r) =>
      r.status === "PENDING" &&
      (r.role === "ACADEMY_OWNER" || r.role === "PRODUCER"),
  );

  const load = useCallback(async () => {
    const res = await apiFetch("/me/role-checks");
    if (res.ok) setRows((await res.json()) as Row[]);
    else setRows([]);
  }, []);

  useEffect(() => {
    if (pendingRoles.length > 0) {
      // Re-valida /me al visitar la superficie: si el admin aprobó el
      // rol, los badges/lente se actualizan sin reabrir la app.
      void refresh();
      void load();
    }
  }, [pendingRoles.length, load, refresh]);

  async function resendVerification() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/auth/resend-verification", {
        method: "POST",
      });
      if (res.ok) {
        setVerifyOpen(true);
      } else {
        setError(t("verifyError"));
      }
    } catch {
      setError(t("verifyError"));
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!me?.email) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: me.email, code }),
      });
      if (res.ok) {
        setVerifyOpen(false);
        setCode("");
        setNotice({ text: t("verified") });
        await refresh();
        await load();
        return;
      }
      setError(res.status === 401 ? t("otpInvalid") : t("verifyError"));
    } catch {
      setError(t("verifyError"));
    } finally {
      setBusy(false);
    }
  }

  if (pendingRoles.length === 0 || rows === null || rows.length === 0) {
    return null;
  }

  return (
    <Card className="flex flex-col gap-3 border-amber-400/30 bg-amber-400/5 p-4">
      {rows.map((row) => {
        const missing = CHECK_KEYS.filter((k) => row.checks[k] === false);
        return (
          <div key={row.role} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">
                {t("title", { role: t(`roles.${row.role}`) })}
              </h3>
              <Badge variant="neon">{t("pending")}</Badge>
            </div>
            <p className="text-xs text-ink/60">
              {row.complete ? t("hintComplete") : t("hintPending")}
            </p>
            {missing.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {missing.map((k) => {
                  const href =
                    k === "actorData"
                      ? (ACTOR_HREF[row.role] ?? "/perfil/datos")
                      : CHECK_HREF[k];
                  const label =
                    k === "actorData"
                      ? t(`actorLabels.${row.role}`)
                      : t(`checks.${k}`);
                  if (k === "emailVerified") {
                    return (
                      <li key={k}>
                        <button
                          type="button"
                          onClick={() => void resendVerification()}
                          className="inline-flex items-center rounded-full bg-elevated px-2 py-0.5 text-[11px] text-ink/60 transition-colors hover:bg-neon/15 hover:text-neon"
                        >
                          ✗ {label} · {t("verifyCta")}
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={k}>
                      {href ? (
                        <Link
                          href={href}
                          className="inline-flex items-center rounded-full bg-elevated px-2 py-0.5 text-[11px] text-ink/60 transition-colors hover:bg-neon/15 hover:text-neon"
                        >
                          ✗ {label}
                        </Link>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-elevated px-2 py-0.5 text-[11px] text-ink/50">
                          ✗ {label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      {verifyOpen && (
        <form
          onSubmit={submitOtp}
          className="flex flex-col gap-2 border-t border-line/60 pt-3"
        >
          <p className="text-xs text-ink/60">
            {t("verifySent", { email: me?.email ?? "" })}
          </p>
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder={t("otpPlaceholder")}
              className="w-36 rounded-lg border border-line bg-surface px-3 py-2 text-center font-mono text-sm tracking-[0.4em] focus:border-neon focus:outline-none"
            />
            <Button
              type="submit"
              size="sm"
              disabled={busy || code.length !== 6}
            >
              {busy ? <Spinner size="sm" /> : t("otpSubmit")}
            </Button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
      )}
      {!verifyOpen && error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </Card>
  );
}
