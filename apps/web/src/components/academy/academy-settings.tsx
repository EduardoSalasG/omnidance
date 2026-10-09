"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, Card } from "@/components/ui";
import { inputCls, readError, type Academy } from "./shared";

// Quórum por defecto cuando la academia no tiene uno configurado
// (Academy.defaultQuorum === null) - mismo fallback del backend.
const DEFAULT_QUORUM_FALLBACK = 20;

/**
 * Configuración de la academia - por ahora solo `defaultQuorum`
 * (PATCH /academies/:id/settings, owner/admin - el server responde 403
 * a instructores). Misma regla de visibilidad que videos.tsx:
 * ADMIN o me.id === academy.ownerId; sin sesión resuelta no se renderiza
 * (evita flash del card a instructores).
 */
export function AcademySettings({ academy }: { academy: Academy }) {
  const t = useTranslations("academy.settings");
  const tc = useTranslations("common");

  // /me compartido - la guard owner/ADMIN gatea el card completo
  // (instructores nunca lo ven); mientras resuelve, null = oculto.
  const { me, loading: meLoading } = useMe();
  const [quorum, setQuorum] = useState(
    academy.defaultQuorum != null ? String(academy.defaultQuorum) : "",
  );
  // Valor efectivo mostrado ("Actual: N") - la prop academy no se
  // refetchea tras guardar, así que se actualiza localmente.
  const [current, setCurrent] = useState<number | null>(
    academy.defaultQuorum ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Precio de la clase particular (private-lesson-product): null/vacío =
  // la academia no vende particulares.
  const [lessonPrice, setLessonPrice] = useState(
    academy.privateLessonPrice != null
      ? String(academy.privateLessonPrice)
      : "",
  );
  const [currentLessonPrice, setCurrentLessonPrice] = useState<
    number | null
  >(academy.privateLessonPrice ?? null);

  const canAdminister =
    !meLoading &&
    !!me &&
    (me.roles.includes("ADMIN") || me.id === academy.ownerId);

  if (!canAdminister) return null;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = quorum.trim();
    const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
    const next = parsed !== null && Number.isFinite(parsed) ? parsed : null;
    const priceRaw = lessonPrice.trim();
    const priceParsed =
      priceRaw === "" ? null : Number.parseInt(priceRaw, 10);
    const nextPrice =
      priceParsed !== null && Number.isFinite(priceParsed) && priceParsed >= 0
        ? priceParsed
        : null;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiFetch(`/academies/${academy.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultQuorum: next,
          privateLessonPrice: nextPrice,
        }),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? t("saveError"));
        return;
      }
      setCurrent(next);
      setCurrentLessonPrice(nextPrice);
      setFeedback(t("saved"));
    } catch {
      setError(t("saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("title")}
      </h2>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">{t("defaultQuorum")}</span>
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
          <span className="text-xs text-ink/40">
            {t("defaultQuorumHint")}{" "}
            {t("defaultQuorumCurrent", {
              value: current ?? DEFAULT_QUORUM_FALLBACK,
            })}
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">
            {t("privateLessonPrice")}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className={`${inputCls} sm:max-w-40`}
            value={lessonPrice}
            onChange={(e) => setLessonPrice(e.target.value)}
          />
          <span className="text-xs text-ink/40">
            {t("privateLessonPriceHint")}{" "}
            {currentLessonPrice != null && `$${currentLessonPrice.toLocaleString("es-CL")}`}
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
