"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag } from "@/components/ui";
import {
  EDITABLE_STATUSES,
  readError,
  type EventDetail,
} from "./shared";

const FEE_FIELDS = [
  "serviceFeeClp",
  "doorAppFeeClp",
  "doorCashFeeClp",
  "platformFeePct",
] as const;
type FeeField = (typeof FEE_FIELDS)[number];

const FEE_LABEL_KEY: Record<FeeField, string> = {
  serviceFeeClp: "serviceFee",
  doorAppFeeClp: "doorApp",
  doorCashFeeClp: "doorCash",
  platformFeePct: "platformPct",
};

function draftsFromEvent(event: EventDetail): Record<FeeField, string> {
  return {
    serviceFeeClp: event.serviceFeeClp?.toString() ?? "",
    doorAppFeeClp: event.doorAppFeeClp?.toString() ?? "",
    doorCashFeeClp: event.doorCashFeeClp?.toString() ?? "",
    platformFeePct: event.platformFeePct?.toString() ?? "",
  };
}

/** Draft → número o null ("" / NaN → null = vuelve a heredar). */
function parseFeeDraft(raw: string, integer: boolean): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return integer ? Math.trunc(n) : n;
}

type Props = {
  event: EventDetail;
  /** roles de GET /me incluyen "ADMIN" — solo admin puede PATCHear fees. */
  isAdmin: boolean;
  /** Refrescar el evento tras un guardado exitoso. */
  onSaved: () => void;
};

/**
 * Comisiones del evento (PATCH /events/:id). Los 4 campos son overrides
 * admin-only: null → hereda el default del productor (o el global).
 * Productores ven todo read-only; el backend rechaza el PATCH con 403
 * si un no-admin envía estos campos.
 */
export function EventFeesSection({ event, isAdmin, onSaved }: Props) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  // El backend solo acepta PATCH en DRAFT/PUBLISHED — fuera de esos
  // estados la sección queda read-only aunque el usuario sea admin.
  const canEdit = isAdmin && EDITABLE_STATUSES.includes(event.status);

  const [drafts, setDrafts] = useState<Record<FeeField, string>>(() =>
    draftsFromEvent(event),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(draftsFromEvent(event));
  }, [event]);

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
          serviceFeeClp: parseFeeDraft(drafts.serviceFeeClp, true),
          doorAppFeeClp: parseFeeDraft(drafts.doorAppFeeClp, true),
          doorCashFeeClp: parseFeeDraft(drafts.doorCashFeeClp, true),
          platformFeePct: parseFeeDraft(drafts.platformFeePct, false),
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("fees.title")}
      </h2>

      <div className="flex flex-col gap-4">
        {FEE_FIELDS.map((f) => {
          const isPct = f === "platformFeePct";
          const value = event[f] ?? null;
          return (
            <div key={f} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {canEdit ? (
                  <label
                    htmlFor={`event-fee-${f}`}
                    className="text-sm text-white/70"
                  >
                    {t(`fees.${FEE_LABEL_KEY[f]}`)}
                  </label>
                ) : (
                  <span className="text-sm text-white/70">
                    {t(`fees.${FEE_LABEL_KEY[f]}`)}
                  </span>
                )}
                <Badge variant={value != null ? "outline" : "muted"}>
                  {value != null ? t("fees.override") : t("fees.inherit")}
                </Badge>
              </div>
              {canEdit ? (
                <input
                  id={`event-fee-${f}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={isPct ? "any" : 1}
                  value={drafts[f]}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [f]: e.target.value }))
                  }
                  className="min-h-[44px] rounded-lg border border-white/15 bg-black/40 px-3 font-mono text-sm"
                />
              ) : (
                <span className="text-base">
                  {isPct ? (
                    value != null ? (
                      <span className="font-semibold text-neon">
                        {value}%
                      </span>
                    ) : (
                      <span className="text-white/50">—</span>
                    )
                  ) : (
                    <PriceTag amount={value} />
                  )}
                </span>
              )}
            </div>
          );
        })}
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
        <p className="text-xs text-white/50">{t("fees.adminOnly")}</p>
      )}
    </Card>
  );
}
