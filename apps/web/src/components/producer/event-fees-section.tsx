"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import {
  EDITABLE_STATUSES,
  readError,
  type EventDetail,
} from "./shared";

/** Draft → número o null ("" / NaN → null = vuelve a heredar). */
function parseFeeDraft(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

type Props = {
  event: EventDetail;
  /** roles de GET /me incluyen "ADMIN" - solo admin puede PATCHear fees. */
  isAdmin: boolean;
  /** Refrescar el evento tras un guardado exitoso. */
  onSaved: () => void;
};

/**
 * Comisión del evento (PATCH /events/:id, spec producer-fee-model): el
 * único override financiero es la tasa todo incluido - vacío hereda el
 * default del productor (o el global). El comprador siempre paga el
 * precio publicado exacto; la comisión se descuenta de la liquidación.
 * Productores la ven read-only; el backend rechaza el PATCH con 403 si
 * un no-admin la envía.
 */
export function EventFeesSection({ event, isAdmin, onSaved }: Props) {
  const t = useTranslations("producer");

  // El backend solo acepta PATCH en DRAFT/PUBLISHED - fuera de esos
  // estados la sección queda read-only aunque el usuario sea admin.
  const canEdit = isAdmin && EDITABLE_STATUSES.includes(event.status);

  const [draft, setDraft] = useState(
    () => event.platformFeePct?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(event.platformFeePct?.toString() ?? "");
  }, [event]);

  const value = event.platformFeePct ?? null;

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await apiFetch(`/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformFeePct: parseFeeDraft(draft),
        }),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? t("fees.error"));
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch {
      setError(t("fees.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("fees.title")}
      </h2>

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {canEdit ? (
            <label
              htmlFor="event-fee-platformFeePct"
              className="text-sm text-ink/70"
            >
              {t("fees.platformPct")}
            </label>
          ) : (
            <span className="text-sm text-ink/70">
              {t("fees.platformPct")}
            </span>
          )}
          <Badge variant={value != null ? "outline" : "muted"}>
            {value != null ? t("fees.override") : t("fees.inherit")}
          </Badge>
        </div>
        {canEdit ? (
          <input
            id="event-fee-platformFeePct"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[44px] rounded-lg border border-ink/15 bg-canvas px-3 font-mono text-sm"
          />
        ) : (
          <span className="text-base">
            {value != null ? (
              <span className="font-semibold text-neon">{value}%</span>
            ) : (
              <span className="text-ink/50">-</span>
            )}
          </span>
        )}
        <p className="text-xs text-ink/50">{t("fees.allinHint")}</p>
      </div>

      {canEdit && (
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            {saved ? t("fees.saved") : t("fees.save")}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
        </div>
      )}

      {!isAdmin && (
        <p className="text-xs text-ink/50">{t("fees.adminOnly")}</p>
      )}
    </Card>
  );
}
