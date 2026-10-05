"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CONSENT_VERSION } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { CHROME_HIDDEN_PREFIXES } from "@/components/layout/BottomNav";
import { XIcon } from "@/components/ui";

type MeConsent = {
  consentAcceptedAt?: string | null;
  consentVersion?: string | null;
};

/**
 * Aviso de consentimiento legal (spec legal-consent): si GET /me trae
 * consentAcceptedAt null o consentVersion distinta de la vigente, se
 * muestra un banner fijo NO bloqueante sobre el contenido.
 * - "Acepto" → POST /me/consent → se oculta y no vuelve (servidor
 *   estampa la versión vigente).
 * - Dismiss (X) lo cierra solo para este montaje — al recargar la app
 *   vuelve hasta que la persona acepte (dismissible-pero-persistente).
 * - 401 (sin sesión) o respuesta sin campos → no se muestra.
 */
export function ConsentBanner() {
  const t = useTranslations("consent");
  const pathname = usePathname();
  // null = aún no sabemos (fetch pendiente) → no renderizar nada.
  const [needsConsent, setNeedsConsent] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/me")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const me = (await res.json()) as MeConsent;
        setNeedsConsent(
          !me.consentAcceptedAt || me.consentVersion !== CONSENT_VERSION,
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needsConsent || dismissed) return null;

  async function accept() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await apiFetch("/me/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: CONSENT_VERSION }),
      });
      if (res.ok) {
        setNeedsConsent(false);
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  // La tab bar (4rem + safe-area) solo existe cuando el chrome se ve —
  // en contextos fullscreen (staff) el banner baja hasta el borde.
  const chromeHidden = CHROME_HIDDEN_PREFIXES.some((p) =>
    pathname.startsWith(p),
  );

  return (
    <div
      role="region"
      aria-label={t("bannerTitle")}
      className={`fixed inset-x-0 z-40 px-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-lg sm:-translate-x-1/2 ${
        chromeHidden
          ? "bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
          : "bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)]"
      }`}
    >
      <div className="rounded-2xl border border-white/15 bg-night-900/95 p-4 shadow-xl shadow-black/40 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">
              {t("bannerTitle")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/60">
              {t("bannerBody")}{" "}
              <Link
                href="/privacidad"
                className="font-medium text-neon underline-offset-4 hover:underline"
              >
                {t("bannerChanges")}
              </Link>
            </p>
            {failed && (
              <p role="alert" className="mt-2 text-xs text-red-400">
                {t("bannerError")}
              </p>
            )}
            <button
              type="button"
              onClick={accept}
              disabled={busy}
              aria-busy={busy}
              className="mt-3 inline-flex min-h-11 items-center rounded-full bg-neon px-5 text-sm font-semibold text-night-950 transition-colors hover:bg-neon-soft active:scale-[0.97] disabled:opacity-60"
            >
              {t("bannerAccept")}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t("bannerDismiss")}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:text-white"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
