"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { CheckIcon, Spinner } from "@/components/ui";
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
  /**
   * event.producerId === me.id. /producer/fee-params resuelve los
   * defaults DEL CALLER - sin owner no podemos saber la tasa efectiva
   * heredada de otro productor y se muestra "-".
   */
  isOwner: boolean;
  /** Refrescar el evento tras un guardado exitoso. */
  onSaved: () => void;
};

/**
 * Comisión del evento (PATCH /events/:id, spec producer-fee-model): se
 * muestra como un dato más del header del evento (junto a fecha/lugar),
 * no como sección. Si el evento no tiene override se muestra la tasa
 * efectiva resuelta (GET /producer/fee-params: default del productor o
 * global). Admin con evento editable abre la edición inline; el backend
 * rechaza el PATCH con 403 si un no-admin la envía.
 */
export function EventFeeInline({ event, isAdmin, isOwner, onSaved }: Props) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  const canEdit = isAdmin && EDITABLE_STATUSES.includes(event.status);

  // Sin override del evento: la tasa efectiva del productor (o global).
  const [effectivePct, setEffectivePct] = useState<number | null>(null);

  useEffect(() => {
    if (event.platformFeePct != null || !isOwner) {
      setEffectivePct(null);
      return;
    }
    let cancelled = false;
    apiFetch("/producer/fee-params")
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as {
          effective?: { platformFeePct?: number | null };
        };
        setEffectivePct(body.effective?.platformFeePct ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [event.id, event.platformFeePct, isOwner]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    () => event.platformFeePct?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(event.platformFeePct?.toString() ?? "");
  }, [event, editing]);

  const value = event.platformFeePct ?? null;
  // Lo que se muestra: override del evento o la tasa efectiva heredada.
  const shown = value ?? effectivePct;

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
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch {
      setError(t("fees.error"));
    } finally {
      setSaving(false);
    }
  }

  if (editing && canEdit) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-ink/70">
        <label htmlFor="event-fee-platformFeePct">
          {t("fees.platformPct")}
        </label>
        <input
          id="event-fee-platformFeePct"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-9 w-24 rounded-lg border border-ink/15 bg-canvas px-2 font-mono text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        />
        <button
          type="button"
          className="min-h-9 rounded-lg bg-neon px-3 text-sm font-semibold text-canvas disabled:opacity-60"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? <Spinner className="size-4" /> : tc("save")}
        </button>
        <button
          type="button"
          className="min-h-9 rounded-lg px-2 text-sm text-ink/60 hover:text-ink"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
        >
          {tc("cancel")}
        </button>
        {error && (
          <span role="alert" className="text-sm text-red-400">
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span>
        {t("fees.shortLabel")}:{" "}
        {shown != null ? (
          <strong className="font-semibold text-ink/80">{shown}%</strong>
        ) : (
          "-"
        )}
      </span>
      {saved && <CheckIcon className="size-3.5 text-neon" />}
      {canEdit && (
        <button
          type="button"
          className="min-h-6 rounded px-1.5 text-xs text-neon underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
          onClick={() => {
            setError(null);
            setEditing(true);
          }}
        >
          {t("fees.edit")}
        </button>
      )}
    </span>
  );
}
