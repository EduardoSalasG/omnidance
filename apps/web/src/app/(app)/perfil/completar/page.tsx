"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, Card, RefreshIcon } from "@/components/ui";
import { PageLoading, Spinner } from "@/components/ui/spinner";
import { inputCls } from "@/components/academy/shared";

type Phase = "loading" | "form" | "done" | "error";

/**
 * Cierre del flujo lead → usuario real: el admin convirtió el lead
 * (pendingProfileAt) y aquí la persona confirma/completa sus datos.
 * POST /me/complete-profile apaga isDemoAccount → la cuenta ya escribe.
 * Si llega alguien sin pendiente, se redirige a /perfil.
 */
export default function CompletarPerfilPage() {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const router = useRouter();

  // /me compartido (MeProvider) - la fase inicial se deriva del contexto;
  // quien llega sin pendingProfile vuelve a /perfil.
  const {
    me,
    loading: meLoading,
    error: meError,
    refresh: refreshMe,
  } = useMe();
  const [phase, setPhase] = useState<Phase>("loading");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (meLoading) return;
    if (meError || !me) {
      setPhase("error");
      return;
    }
    if (!me.pendingProfile) {
      router.replace("/perfil");
      return;
    }
    setPhase((p) => (p === "loading" || p === "error" ? "form" : p));
  }, [meLoading, meError, me, router]);

  // Pre-fill del nombre una sola vez cuando el form aparece.
  const prefilled = useRef(false);
  useEffect(() => {
    if (phase === "form" && !prefilled.current) {
      prefilled.current = true;
      setName(me?.name ?? "");
    }
  }, [phase, me]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Password opcional: solo se valida el mínimo si la escribió (con
    // minLength nativo, 1–7 chars bloqueaba el submit sin explicación).
    if (password && password.length < 8) {
      setError(t("complete.passwordShort"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/me/complete-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          ...(password ? { password } : {}),
        }),
      });
      // 409 = teléfono ya registrado en otra cuenta (people.controller
      // distingue el caso con ConflictException("phone_exists")).
      if (res.status === 409) {
        setError(t("complete.phoneTaken"));
        return;
      }
      if (!res.ok) throw new Error();
      setPhase("done");
      // La sesión ya no es demo - /inicio carga la app completa.
      setTimeout(() => router.replace("/inicio"), 1200);
    } catch {
      setError(t("complete.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[60dvh] w-full max-w-lg flex-col justify-center px-4 py-8">
      {phase === "loading" && <PageLoading />}

      {phase === "error" && (
        /* Error de CARGA (/me), no de guardado: copy propia + retry +
           salida a /login (un 401 también aterriza acá). */
        <div className="flex flex-col items-center gap-4 text-center">
          <p role="alert" className="text-sm text-ink/70">
            {t("complete.loadError")}
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setPhase("loading");
                void refreshMe();
              }}
            >
              <RefreshIcon /> {tc("retry")}
            </Button>
            <Button variant="ghost" href="/login">
              {tc("login")}
            </Button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <Card className="p-6 text-center">
          <p role="status" className="text-lg font-bold text-neon">
            {t("complete.success")}
          </p>
        </Card>
      )}

      {phase === "form" && (
        <>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("complete.title")}
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            {t("complete.subtitle")}
          </p>
          <Card className="mt-6 p-5">
            <form onSubmit={submit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ink/60">
                  {t("complete.name")}
                </span>
                <input
                  required
                  minLength={2}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ink/60">
                  {t("complete.phone")}
                </span>
                <input
                  required
                  type="tel"
                  minLength={6}
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={saving}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ink/60">
                  {t("complete.password")}
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={saving}
                  className={inputCls}
                />
                <span className="text-[11px] text-ink/40">
                  {t("complete.passwordHint")}
                </span>
              </label>

              {error && (
                <p role="alert" className="text-sm font-medium text-red-400">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={saving} className="mt-1">
                {saving && <Spinner size="sm" />}
                {t("complete.submit")}
              </Button>
            </form>
          </Card>
        </>
      )}
    </main>
  );
}
