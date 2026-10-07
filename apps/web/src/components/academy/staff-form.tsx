"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { inputCls, readError } from "./shared";
import { CAPS, EMPTY_CAPS, CapCheckbox, type Caps } from "./staff-section";

/**
 * Alta de colaborador - vive en la página dedicada /academia/equipo/nuevo.
 * POST /academies/:id/staff por email: si la persona no tiene cuenta se
 * crea stub + invitación (body.invited → mensaje distinto). Los toggles
 * por fila y la baja quedan en el listado (acciones por fila).
 */
export function StaffForm({ academyId }: { academyId: string }) {
  const t = useTranslations("academyStaff");
  const tc = useTranslations("common");
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [newCaps, setNewCaps] = useState<Caps>(EMPTY_CAPS);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Éxito breve antes de volver al listado (que refetchea al montar).
  const [msg, setMsg] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch(`/academies/${academyId}/staff`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          ...newCaps,
        }),
      });
      if (!res.ok) {
        setErr((await readError(res)) ?? t("error"));
        return;
      }
      const body = (await res.json()) as { invited: boolean };
      setMsg(body.invited ? t("invitedMsg") : t("added"));
      setTimeout(() => router.push("/academia/equipo"), 1200);
    } catch {
      setErr(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      {msg ? (
        <p role="status" className="text-sm text-neon">
          {msg}
        </p>
      ) : (
        <>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {t("addTitle")}
            </h2>
            <p className="mt-1 text-xs text-ink/50">{t("addDesc")}</p>
          </div>
          <form onSubmit={add} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">
                {t("fieldEmail")}
                <span aria-hidden="true" className="text-neon">
                  {" "}
                  *
                </span>
              </span>
              <input
                type="email"
                required
                className={inputCls}
                placeholder={t("fieldEmailPh")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("fieldName")}</span>
              <input
                className={inputCls}
                placeholder={t("fieldNamePh")}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-xs text-ink/50">
                {t("capsLegend")}
              </legend>
              <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
                {CAPS.map((cap) => (
                  <CapCheckbox
                    key={cap}
                    cap={cap}
                    checked={newCaps[cap]}
                    onToggle={(c, next) =>
                      setNewCaps((prev) => ({ ...prev, [c]: next }))
                    }
                  />
                ))}
              </div>
            </fieldset>
            {err && (
              <p role="alert" className="text-sm text-red-400">
                {err}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? t("adding") : t("add")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => router.push("/academia/equipo")}
              >
                {tc("cancel")}
              </Button>
            </div>
          </form>
        </>
      )}
    </Card>
  );
}
