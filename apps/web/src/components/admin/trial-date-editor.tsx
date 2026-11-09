"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { apiFetch } from "@/lib/api";
import { Button, Spinner } from "@/components/ui";
import { getDateFmt } from "@/lib/intl";

/**
 * Editor inline del fin de trial (spec platform-trials §Ajuste admin):
 * fecha + "Ajustar" → input date + guardar/cancelar. El día elegido se
 * interpreta como fin de ese día en Santiago (≈04:00 UTC del día
 * siguiente, mismo criterio `clEndOfDay` del barrido y la promo
 * diaria): fijar "5 dic" deja el trial vivo hasta que cierra el 5 en
 * Chile, no a medianoche UTC. El feedback post-acción lo da el padre
 * vía onSaved/onError → ActionNotice.
 */
export function TrialDateEditor({
  endpoint,
  value,
  onSaved,
  onError,
}: {
  /** PATCH admin que recibe `{endsAt: ISO}` y devuelve 200. */
  endpoint: string;
  /** ISO actual o null si el actor nunca tuvo trial. */
  value: string | null;
  onSaved: (endsAt: string) => void | Promise<void>;
  onError: (text: string) => void;
}) {
  const t = useTranslations("admin.trials");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  const open = () => {
    setDate(value ? value.slice(0, 10) : "");
    setEditing(true);
  };

  async function save() {
    if (!date || saving) return;
    setSaving(true);
    try {
      const [y, m, d] = date.split("-").map(Number);
      const endsAt = new Date(Date.UTC(y, m - 1, d + 1, 4)).toISOString();
      const res = await apiFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endsAt }),
      });
      if (!res.ok) {
        onError(tc("error"));
        return;
      }
      setEditing(false);
      await onSaved(endsAt);
    } catch {
      onError(tc("error"));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span className="flex items-center gap-2">
        <span className="tabular-nums">
          {value
            ? getDateFmt(locale, { dateStyle: "medium" }).format(
                new Date(value),
              )
            : "—"}
        </span>
        <Button variant="ghost" size="sm" onClick={open}>
          {value ? t("adjust") : t("set")}
        </Button>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label={t("dateLabel")}
        className="min-h-11 rounded-lg border border-ink/15 bg-canvas px-2 text-sm"
      />
      <Button
        size="sm"
        onClick={() => void save()}
        disabled={!date || saving}
      >
        {saving ? <Spinner /> : tc("save")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setEditing(false)}
        disabled={saving}
      >
        {tc("cancel")}
      </Button>
    </span>
  );
}
