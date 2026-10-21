"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, Card } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { ActionNotice } from "@/components/ui/action-notice";
import { inputCls } from "@/components/academy/shared";

/**
 * Sección "Seguridad" de /perfil/datos (spec cambiar-password).
 * - Cuenta con contraseña (hasPassword): pide la actual + nueva +
 *   confirmación; PUT /me/password verifica la actual server-side
 *   (400 password.incorrect | password.same).
 * - Cuenta magic-link-only (sin hash): solo nueva + confirmación -
 *   "establecer contraseña" sin campo actual.
 * Errores de validación y los 400 semánticos van inline (role="alert");
 * éxito y fallos genéricos van al ActionNotice flotante.
 */
export function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const { refresh: refreshMe } = useMe();
  const [editing, setEditing] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);

  function close() {
    setEditing(false);
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 8) {
      setError(t("password.tooShort"));
      return;
    }
    if (confirmPw !== newPw) {
      setError(t("password.mismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/me/password", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(hasPassword ? { currentPassword: currentPw } : {}),
          newPassword: newPw,
        }),
      });
      if (!res.ok) {
        // El API responde 400 {message:"password.incorrect"|"password.same"}
        // para los casos semánticos - se mapean a copy inline.
        const body: unknown = await res.json().catch(() => null);
        const code =
          body && typeof body === "object" && "message" in body
            ? (body as { message?: unknown }).message
            : undefined;
        if (code === "password.incorrect") {
          setError(t("password.incorrect"));
        } else if (code === "password.same") {
          setError(t("password.same"));
        } else {
          setNotice({ text: t("password.saveError"), error: true });
        }
        return;
      }
      close();
      setNotice({ text: t("password.saved") });
      // Tras el primer set hasPassword pasa a true en /me.
      void refreshMe();
    } catch {
      setNotice({ text: t("password.saveError"), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("password.title")}
      </h2>
      {editing ? (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-4">
          {hasPassword && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink/60">
                {t("password.current")}
              </span>
              <input
                required
                type="password"
                autoComplete="current-password"
                value={currentPw}
                onChange={(e) => {
                  setCurrentPw(e.target.value);
                  setError(null);
                }}
                disabled={busy}
                className={inputCls}
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink/60">
              {t("password.new")}
            </span>
            <input
              required
              type="password"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => {
                setNewPw(e.target.value);
                setError(null);
              }}
              disabled={busy}
              className={inputCls}
            />
            <span className="text-[11px] text-ink/40">
              {t("password.hint")}
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink/60">
              {t("password.confirm")}
            </span>
            <input
              required
              type="password"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => {
                setConfirmPw(e.target.value);
                setError(null);
              }}
              disabled={busy}
              className={inputCls}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-400">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={close}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy && <Spinner size="sm" />}
              {tc("save")}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-4 py-1">
            <span className="shrink-0 text-xs uppercase tracking-wide text-ink/50">
              {t("password.label")}
            </span>
            <span className="min-w-0 truncate text-right text-sm">
              {hasPassword ? t("password.defined") : t("password.notSet")}
            </span>
          </div>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-ink/60 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              {hasPassword ? t("password.change") : t("password.set")}
            </button>
          </div>
        </>
      )}
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </Card>
  );
}
