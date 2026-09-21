"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import landingParts from "@/i18n/parts/landing.json";

const t = landingParts.landingPro.form;

// Orden fijo del multiselect — los valores son los role keys del backend.
const ROLE_OPTIONS = [
  { value: "PRODUCER", label: t.roleProducer },
  { value: "DJ", label: t.roleDj },
  { value: "ACADEMY_OWNER", label: t.roleAcademy },
  { value: "VENUE_MANAGER", label: t.roleVenue },
] as const;

type Intent = "CONTACT" | "DEMO";

const inputClass =
  "min-h-12 w-full rounded-xl border border-white/10 bg-night-900/60 px-4 text-base text-white placeholder:text-white/30 outline-none transition-colors focus:border-neon/60";

/**
 * Formulario de lead de la landing /pro: captura nombre, correo, teléfono y
 * roles declarados antes de los dos intents (contacto / demo). Éxito →
 * reemplaza el formulario por la confirmación.
 */
export function ProLeadForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [pending, setPending] = useState<Intent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Intent | null>(null);

  const toggleRole = (value: string) =>
    setRoles((prev) =>
      prev.includes(value)
        ? prev.filter((r) => r !== value)
        : [...prev, value],
    );

  async function submit(intent: Intent) {
    setError(null);
    if (roles.length === 0) {
      setError(t.errorRoles);
      return;
    }
    setPending(intent);
    try {
      const res = await apiFetch("/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, phone, roles, intent }),
      });
      if (!res.ok) throw new Error();
      setDone(intent);
    } catch {
      setError(t.errorGeneric);
    } finally {
      setPending(null);
    }
  }

  if (done) {
    return (
      <div
        role="status"
        className="mx-auto max-w-md rounded-2xl border border-neon/30 bg-neon/5 px-8 py-10"
      >
        <p className="text-xl font-bold text-neon">
          {t.successTitle.replace("{name}", name.split(" ")[0])}
        </p>
        <p className="mt-2 text-sm text-white/60">
          {done === "DEMO" ? t.successDemo : t.successContact}
        </p>
      </div>
    );
  }

  return (
    <form
      className="mx-auto flex max-w-md flex-col gap-4 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        void submit("CONTACT");
      }}
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-white/60">
            {t.fieldName}
          </span>
          <input
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-white/60">
            {t.fieldPhone}
          </span>
          <input
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-white/60">
          {t.fieldEmail}
        </span>
        <input
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </label>

      <fieldset>
        <legend className="text-xs font-medium text-white/60">
          {t.fieldRoles}
        </legend>
        <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
          {ROLE_OPTIONS.map((option) => {
            const active = roles.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleRole(option.value)}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors active:scale-[0.97] ${
                  active
                    ? "border-neon bg-neon/15 text-neon"
                    : "border-white/15 text-white/60 hover:border-white/30 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-400">
          {error}
        </p>
      )}

      <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button
          type="submit"
          disabled={pending !== null}
          className="inline-flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-neon px-8 text-base font-semibold text-night-950 transition-colors hover:bg-neon-soft active:scale-[0.97] disabled:opacity-60 sm:w-auto"
        >
          {pending === "CONTACT" && <Spinner size="sm" />}
          {t.submitContact}
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => void submit("DEMO")}
          className="inline-flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-full border border-white/15 px-8 text-base font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white active:scale-[0.97] disabled:opacity-60 sm:w-auto"
        >
          {pending === "DEMO" && <Spinner size="sm" />}
          {t.submitDemo}
        </button>
      </div>
    </form>
  );
}
