"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";

type Mode = "password" | "magic" | "register";

const inputClass =
  "min-h-12 rounded-xl border border-night-700 bg-night-900 px-4 py-3 text-white focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50 aria-[invalid=true]:border-red-400";

const labelClass = "flex flex-col gap-2";
const labelTextClass = "text-sm text-white/70";

function Field({
  label,
  required = true,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={labelClass}>
      <span className={labelTextClass}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-neon">
            {" "}
            *
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

// initialMode llega del server page (?mode=register desde los CTAs de
// "crear cuenta" de las landings — que no aterricen en un login).
// next: middleware manda ?next=/ruta cuando un anónimo pide un módulo
// protegido — tras login volvemos ahí en vez de siempre a /inicio.
export default function LoginForm({
  initialMode,
  next,
}: {
  initialMode?: Mode;
  next?: string;
}) {
  const t = useTranslations("login");
  const [mode, setMode] = useState<Mode>(initialMode ?? "password");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function go(path: string) {
    // Recarga completa: la cookie de sesión debe estar activa antes de
    // que la app monte el realtime/SSR.
    window.location.href = path;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "register") {
      if (password.length < 8) {
        setError(t("passwordTooShort"));
        return;
      }
      if (password !== password2) {
        setError(t("passwordMismatch"));
        return;
      }
    }

    setLoading(true);
    const body =
      mode === "register"
        ? { email, name: name.trim() || email.split("@")[0], password }
        : mode === "password"
          ? { email, password }
          : { email };
    const endpoint =
      mode === "register"
        ? "/auth/register"
        : mode === "password"
          ? "/auth/login"
          : "/auth/magic-link";

    try {
      const res = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setLoading(false);
      if (res.ok) {
        if (mode === "magic") setSent(true);
        // next solo rutas internas — nunca un open redirect.
        else go(next?.startsWith("/") && !next.startsWith("//") ? next : "/inicio");
        return;
      }
      if (res.status === 409) setError(t("emailTaken"));
      else if (res.status === 401 || res.status === 400)
        setError(
          mode === "password" ? t("invalidCredentials") : t("invalidEmail"),
        );
      else setError(t("genericError"));
    } catch {
      setLoading(false);
      setError(t("genericError"));
    }
  }

  const isRegister = mode === "register";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">
        {isRegister ? t("registerTitle") : t("title")}
      </h1>

      {sent ? (
        <p aria-live="polite" className="max-w-sm text-center text-white/70">
          {t("sent")}
        </p>
      ) : (
        <>
          {!isRegister && (
            // Selector de método: radio nativo (rol/roles del teclado
            // gratuitos) con pills visuales — mismo patrón del hub /qr.
            <fieldset className="w-full max-w-sm">
              <legend className="sr-only">{t("methodLabel")}</legend>
              <div
                role="radiogroup"
                aria-label={t("methodLabel")}
                className="grid grid-cols-2 gap-1 rounded-2xl bg-night-800 p-1"
              >
                {(["password", "magic"] as const).map((m) => (
                  <label
                    key={m}
                    className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-neon/50 ${
                      mode === m
                        ? "bg-night-950 text-white shadow-sm"
                        : "text-white/50 hover:text-white/80"
                    }`}
                  >
                    <input
                      type="radio"
                      name="login-method"
                      value={m}
                      checked={mode === m}
                      onChange={() => {
                        setMode(m);
                        setError(null);
                      }}
                      className="sr-only"
                    />
                    {t(m === "password" ? "methodPassword" : "methodMagic")}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <form
            onSubmit={submit}
            className="flex w-full max-w-sm flex-col gap-4"
          >
            {isRegister && (
              <Field label={t("nameLabel")} required={false}>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                  className={inputClass}
                />
              </Field>
            )}

            <Field label={t("emailLabel")}>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
                aria-invalid={
                  error && mode === "magic" ? true : undefined
                }
                aria-describedby={error ? "login-error" : undefined}
                className={inputClass}
              />
            </Field>

            {mode !== "magic" && (
              <Field label={t("passwordLabel")}>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete={
                      isRegister ? "new-password" : "current-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={
                      [error ? "login-error" : "", isRegister ? "pw-hint" : ""]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    className={`${inputClass} w-full pr-16`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex min-w-12 items-center justify-center text-sm text-white/50 hover:text-white"
                    aria-pressed={showPassword}
                  >
                    {showPassword ? t("hidePassword") : t("showPassword")}
                  </button>
                </div>
                {isRegister && (
                  <span id="pw-hint" className="text-xs text-white/50">
                    {t("passwordHint")}
                  </span>
                )}
              </Field>
            )}

            {isRegister && (
              <Field label={t("passwordConfirmLabel")}>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  className={inputClass}
                />
              </Field>
            )}

            {error && (
              <p id="login-error" role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={loading}
              aria-busy={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <span aria-hidden="true">…</span>
                  <span className="sr-only">{t("sending")}</span>
                </>
              ) : isRegister ? (
                t("submitRegister")
              ) : mode === "password" ? (
                t("submit")
              ) : (
                t("submitMagic")
              )}
            </Button>

            <button
              type="button"
              onClick={() => {
                setMode(isRegister ? "password" : "register");
                setError(null);
              }}
              className="min-h-11 text-sm text-white/60 underline-offset-4 hover:text-white hover:underline"
            >
              {isRegister ? t("hasAccount") : t("noAccount")}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
