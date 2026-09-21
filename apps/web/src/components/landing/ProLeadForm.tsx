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
// Campos obligatorios validados en cliente antes de pegarle al API —
// el backend revalida igual (el endpoint es público).
type Missing = "name" | "email" | "phone" | "roles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "min-h-12 w-full rounded-xl border border-white/10 bg-night-900/60 px-4 text-base text-white placeholder:text-white/30 outline-none transition-colors focus:border-neon/60";
const inputErrorClass =
  "min-h-12 w-full rounded-xl border border-red-400/70 bg-night-900/60 px-4 text-base text-white placeholder:text-white/30 outline-none transition-colors focus:border-red-400";

/**
 * Formulario de lead de la landing /pro: captura nombre, correo, teléfono y
 * roles declarados antes de los dos intents (contacto / demo). Tras el
 * éxito ofrece "ingresa acá": crea la cuenta demo con esos roles y entra
 * directo a /inicio con sesión.
 */
export function ProLeadForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [missing, setMissing] = useState<Missing[]>([]);
  const [pending, setPending] = useState<Intent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [demoToken, setDemoToken] = useState<string | null>(null);
  const [done, setDone] = useState<Intent | null>(null);
  const [demoPhase, setDemoPhase] = useState<
    "idle" | "loading" | "exists" | "error"
  >("idle");

  const toggleRole = (value: string) =>
    setRoles((prev) =>
      prev.includes(value)
        ? prev.filter((r) => r !== value)
        : [...prev, value],
    );

  function validate(): Missing[] {
    const miss: Missing[] = [];
    if (name.trim().length < 2) miss.push("name");
    if (!EMAIL_RE.test(email.trim())) miss.push("email");
    if (!phone.trim()) miss.push("phone");
    if (roles.length === 0) miss.push("roles");
    return miss;
  }

  const FIELD_LABEL: Record<Missing, string> = {
    name: t.fieldName,
    email: t.fieldEmail,
    phone: t.fieldPhone,
    roles: t.fieldRoles,
  };

  async function submit(intent: Intent) {
    setError(null);
    const miss = validate();
    setMissing(miss);
    if (miss.length > 0) {
      setError(
        t.errorMissing.replace(
          "{fields}",
          miss.map((m) => FIELD_LABEL[m].replace(" (opcional)", "")).join(", "),
        ),
      );
      return;
    }
    setPending(intent);
    try {
      const res = await apiFetch("/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          roles,
          intent,
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        id: string;
        demoToken: string | null;
        accountExists: boolean;
      };
      setLeadId(data.id);
      setDemoToken(data.demoToken);
      // El correo ya tiene cuenta real → no hay demo; el CTA manda a login.
      if (data.accountExists) setDemoPhase("exists");
      setDone(intent);
    } catch {
      setError(t.errorGeneric);
    } finally {
      setPending(null);
    }
  }

  async function enterDemo() {
    if (!leadId || !demoToken) return;
    setDemoPhase("loading");
    try {
      const res = await apiFetch(`/leads/${leadId}/demo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: demoToken }),
      });
      if (res.status === 409) {
        setDemoPhase("exists");
        return;
      }
      if (!res.ok) throw new Error();
      window.location.href = "/inicio";
    } catch {
      setDemoPhase("error");
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

        {demoPhase === "exists" ? (
          <a
            href="/login"
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-white/80 transition-colors hover:border-white/30 hover:text-white"
          >
            {t.demoExists} →
          </a>
        ) : (
          <button
            type="button"
            onClick={() => void enterDemo()}
            disabled={demoPhase === "loading"}
            className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-neon px-6 text-sm font-semibold text-night-950 transition-colors hover:bg-neon-soft active:scale-[0.97] disabled:opacity-60"
          >
            {demoPhase === "loading" && <Spinner size="sm" />}
            {t.demoCta} →
          </button>
        )}
        {demoPhase === "error" && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-400">
            {t.demoError}
          </p>
        )}
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
            aria-invalid={missing.includes("name")}
            className={missing.includes("name") ? inputErrorClass : inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-white/60">
            {t.fieldPhone}
          </span>
          <input
            required
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={missing.includes("phone")}
            className={missing.includes("phone") ? inputErrorClass : inputClass}
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
          aria-invalid={missing.includes("email")}
          className={missing.includes("email") ? inputErrorClass : inputClass}
        />
      </label>

      <fieldset>
        <legend className="text-xs font-medium text-white/60">
          {t.fieldRoles}{" "}
          <span className="text-white/35">— {t.fieldRolesHint}</span>
        </legend>
        <div
          className={`mt-2 flex flex-wrap justify-center gap-2 rounded-xl sm:justify-start ${
            missing.includes("roles")
              ? "border border-red-400/70 p-2"
              : ""
          }`}
        >
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
