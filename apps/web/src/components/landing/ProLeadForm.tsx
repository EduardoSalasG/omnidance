"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import { ChevronRightIcon } from "@/components/ui";
import { useMessages } from "next-intl";
import { Link } from "@/i18n/navigation";
import type landingParts from "@/i18n/parts/landing.json";

type LandingProForm = (typeof landingParts)["landingPro"]["form"];




// Campos obligatorios validados en cliente antes de pegarle al API -
// el backend revalida igual (el endpoint es público).
type Missing = "name" | "email" | "phone" | "roles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "min-h-12 w-full rounded-xl border border-ink/10 bg-surface/60 px-4 text-base text-ink placeholder:text-ink/50 outline-none transition-colors focus:border-neon/60";
const inputErrorClass =
  "min-h-12 w-full rounded-xl border border-red-400/70 bg-surface/60 px-4 text-base text-ink placeholder:text-ink/50 outline-none transition-colors focus:border-red-400";

/**
 * Formulario de lead del hub /pro (roles sin auto-registro: DJ y
 * locales): captura nombre, correo, teléfono y roles para el intent de
 * contacto comercial. Si el correo ya tiene cuenta real, el estado de
 * éxito ofrece ir a /login en vez de prometer contacto.
 * `fixedRole` fija el rol de la audiencia y oculta el selector;
 * `roleOptions` restringe el multiselect.
 */
export function ProLeadForm({
  fixedRole,
  roleOptions,
}: {
  fixedRole?: string;
  roleOptions?: readonly string[];
}) {
  const t = (useMessages() as {
    landingPro: { form: LandingProForm };
  }).landingPro.form;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<string[]>(
    fixedRole ? [fixedRole] : [],
  );
  // Orden fijo del multiselect - los valores son los role keys del
  // backend; labels del catálogo del locale activo.
  const ROLE_OPTIONS = [
    { value: "PRODUCER", label: t.roleProducer },
    { value: "DJ", label: t.roleDj },
    { value: "ACADEMY_OWNER", label: t.roleAcademy },
    { value: "VENUE_MANAGER", label: t.roleVenue },
  ] as const;
  const options = roleOptions
    ? ROLE_OPTIONS.filter((o) => roleOptions.includes(o.value))
    : ROLE_OPTIONS;
  const [missing, setMissing] = useState<Missing[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [done, setDone] = useState(false);

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
    if (!fixedRole && roles.length === 0) miss.push("roles");
    return miss;
  }

  const FIELD_LABEL: Record<Missing, string> = {
    name: t.fieldName,
    email: t.fieldEmail,
    phone: t.fieldPhone,
    roles: t.fieldRoles,
  };

  async function submit() {
    setError(null);
    const miss = validate();
    setMissing(miss);
    if (miss.length > 0) {
      setError(
        t.errorMissing.replace(
          "{fields}",
          miss.map((m) => FIELD_LABEL[m]).join(", "),
        ),
      );
      return;
    }
    setPending(true);
    try {
      const res = await apiFetch("/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          roles,
          intent: "CONTACT",
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { accountExists: boolean };
      if (data.accountExists) setExists(true);
      setDone(true);
    } catch {
      setError(t.errorGeneric);
    } finally {
      setPending(false);
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
        <p className="mt-2 text-sm text-ink/60">{t.successContact}</p>
        {exists && (
          <Link
            href="/login"
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full border border-ink/15 px-6 text-sm font-semibold text-ink/80 transition-colors hover:border-ink/30 hover:text-ink"
          >
            {t.demoExists} <ChevronRightIcon />
          </Link>
        )}
      </div>
    );
  }

  return (
    <form
      className="mx-auto flex max-w-md flex-col gap-4 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink/60">
            {t.fieldName}
          </span>
          <input
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={missing.includes("name")}
            aria-describedby={
              missing.includes("name") ? "lead-error" : undefined
            }
            className={missing.includes("name") ? inputErrorClass : inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink/60">
            {t.fieldPhone}{" "}
            <span className="text-ink/50">({t.fieldPhoneHint})</span>
          </span>
          <input
            type="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={missing.includes("phone")}
            aria-describedby={
              missing.includes("phone") ? "lead-error" : undefined
            }
            className={missing.includes("phone") ? inputErrorClass : inputClass}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ink/60">
          {t.fieldEmail}
        </span>
        <input
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={missing.includes("email")}
          aria-describedby={
            missing.includes("email") ? "lead-error" : undefined
          }
          className={missing.includes("email") ? inputErrorClass : inputClass}
        />
      </label>

      {!fixedRole && (
      <fieldset>
        <legend className="text-xs font-medium text-ink/60">
          {t.fieldRoles}{" "}
          <span className="text-ink/50">({t.fieldRolesHint})</span>
        </legend>
        <div
          className={`mt-2 flex flex-wrap justify-center gap-2 rounded-xl sm:justify-start ${
            missing.includes("roles")
              ? "border border-red-400/70 p-2"
              : ""
          }`}
        >
          {options.map((option) => {
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
                    : "border-ink/15 text-ink/60 hover:border-ink/30 hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      )}

      {error && (
        <p
          id="lead-error"
          role="alert"
          className="text-sm font-medium text-red-400"
        >
          {error}
        </p>
      )}

      <div className="mt-2 flex justify-center">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-neon px-8 text-base font-semibold text-on-accent transition-colors hover:bg-neon-soft active:scale-[0.97] disabled:opacity-60 sm:w-auto"
        >
          {pending && <Spinner size="sm" />}
          {t.submitContact}
        </button>
      </div>
      <p className="text-center text-xs text-ink/50">{t.privacyNote}</p>
    </form>
  );
}
