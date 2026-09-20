"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { inputCls, readError, type Academy } from "./shared";

type Me = { id: string; roles: string[] };

// Quórum por defecto cuando la academia no tiene uno configurado
// (Academy.defaultQuorum === null) — mismo fallback del backend.
const DEFAULT_QUORUM_FALLBACK = 20;

/**
 * Configuración de la academia — por ahora solo `defaultQuorum`
 * (PATCH /academies/:id/settings, owner/admin — el server responde 403
 * a instructores). Misma regla de visibilidad que videos.tsx:
 * ADMIN o me.id === academy.ownerId; sin sesión resuelta no se renderiza
 * (evita flash del card a instructores).
 */
export function AcademySettings({ academy }: { academy: Academy }) {
  const t = useTranslations("academy.settings");
  const tc = useTranslations("common");

  const [me, setMe] = useState<Me | null>(null);
  const [quorum, setQuorum] = useState(
    academy.defaultQuorum != null ? String(academy.defaultQuorum) : "",
  );
  // Valor efectivo mostrado ("Actual: N") — la prop academy no se
  // refetchea tras guardar, así que se actualiza localmente.
  const [current, setCurrent] = useState<number | null>(
    academy.defaultQuorum ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/me")
      .then(async (res) => (res.ok ? ((await res.json()) as Me) : null))
      .then(setMe)
      .catch(() => {});
  }, []);

  const canAdminister =
    !!me && (me.roles.includes("ADMIN") || me.id === academy.ownerId);
  if (!canAdminister) return null;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = quorum.trim();
    const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
    const next = parsed !== null && Number.isFinite(parsed) ? parsed : null;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiFetch(`/academies/${academy.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultQuorum: next }),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? t("saveError"));
        return;
      }
      setCurrent(next);
      setFeedback(t("saved"));
    } catch {
      setError(t("saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("title")}
      </h2>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50">{t("defaultQuorum")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className={`${inputCls} sm:max-w-40`}
            value={quorum}
            onChange={(e) => setQuorum(e.target.value)}
            placeholder={String(DEFAULT_QUORUM_FALLBACK)}
          />
          <span className="text-xs text-white/40">
            {t("defaultQuorumHint")}{" "}
            {t("defaultQuorumCurrent", {
              value: current ?? DEFAULT_QUORUM_FALLBACK,
            })}
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? tc("loading") : tc("save")}
          </Button>
          {feedback && (
            <p role="status" className="text-sm text-neon">
              {feedback}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}
