"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { PageLoading, Spinner } from "@/components/ui/spinner";
import { inputCls } from "@/components/academy/shared";

type Me = {
  id: string;
  name: string;
  email: string | null;
  pendingProfile?: boolean;
};

type Phase = "loading" | "form" | "done" | "error";

/**
 * Cierre del flujo lead → usuario real: el admin convirtió el lead
 * (pendingProfileAt) y aquí la persona confirma/completa sus datos.
 * POST /me/complete-profile apaga isDemoAccount → la cuenta ya escribe.
 * Si llega alguien sin pendiente, se redirige a /perfil.
 */
export default function CompletarPerfilPage() {
  const t = useTranslations("profile");
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/me")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) return setPhase("error");
        const me = (await res.json()) as Me;
        if (!me.pendingProfile) {
          router.replace("/perfil");
          return;
        }
        setName(me.name ?? "");
        setPhase("form");
      })
      .catch(() => !cancelled && setPhase("error"));
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
      if (!res.ok) throw new Error();
      setPhase("done");
      // La sesión ya no es demo — /inicio carga la app completa.
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
        <p role="alert" className="text-center text-sm text-red-400">
          {t("complete.error")}
        </p>
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
          <p className="mt-1 text-sm text-white/60">
            {t("complete.subtitle")}
          </p>
          <Card className="mt-6 p-5">
            <form onSubmit={submit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-white/60">
                  {t("complete.name")}
                </span>
                <input
                  required
                  minLength={2}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-white/60">
                  {t("complete.phone")}
                </span>
                <input
                  required
                  type="tel"
                  minLength={6}
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-white/60">
                  {t("complete.password")}
                </span>
                <input
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls}
                />
                <span className="text-[11px] text-white/40">
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
