"use client";

import { useState } from "react";


import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  optionalConsentScopes,
  useLegalConsent,
  type OptionalConsentScope,
} from "@/lib/legal-consent";
import { CHROME_HIDDEN_PREFIXES } from "@/components/layout/BottomNav";
import { XIcon } from "@/components/ui";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Aviso de consentimiento legal (spec legal-consent +
 * consent-por-jurisdiccion): si GET /me trae consentAcceptedAt null o
 * consentVersion distinta de la vigente DE SU JURISDICCIÓN, se muestra
 * un banner fijo NO bloqueante sobre el contenido.
 * - Consulta GET /legal/consent?jurisdiction=<me.jurisdiction> (vía
 *   useLegalConsent): la versión vigente es por jurisdicción
 *   (CL "cl-v1.0", EU "eu-v1.0"), con fallback a CONSENT_VERSION si el
 *   endpoint falla.
 * - Jurisdicción granular (EU) → checkboxes opt-in por scope
 *   (marketing/analytics); essential queda implícito en "Acepto".
 * - "Acepto" → POST /me/consent {version, scopes} → se oculta y no
 *   vuelve (servidor estampa la versión vigente + ConsentRecord).
 * - Dismiss (X) lo cierra solo para este montaje - al recargar la app
 *   vuelve hasta que la persona acepte (dismissible-pero-persistente).
 * - 401 (sin sesión) → no se muestra.
 */
export function ConsentBanner() {
  const t = useTranslations("consent");
  const pathname = usePathname();
  // /me compartido (MeProvider del layout): mientras `loading` o sin
  // sesión no se sabe → no renderizar nada.
  const { me, loading, refresh: refreshMe } = useMe();
  const { legal, failed: legalFailed, currentVersion } = useLegalConsent(
    me?.jurisdiction,
    !loading && !!me,
  );
  const [optIns, setOptIns] = useState<Record<OptionalConsentScope, boolean>>({
    marketing: false,
    analytics: false,
  });
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const needsConsent =
    !loading &&
    !!me &&
    // Mientras el texto no resuelve (y no falló) no se puede decidir la
    // versión vigente ni el form → no renderizar todavía.
    (!!legal || legalFailed) &&
    (!me.consentAcceptedAt || me.consentVersion !== currentVersion);

  if (!needsConsent || dismissed) return null;

  const optionalScopes = optionalConsentScopes(legal);
  const granular = legal?.granular === true && optionalScopes.length > 0;

  async function accept() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await apiFetch("/me/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          granular
            ? {
                version: currentVersion,
                scopes: { essential: true, ...optIns },
              }
            : { version: currentVersion },
        ),
      });
      if (res.ok) {
        // El /me compartido queda con el consentimiento vigente -
        // cualquier consumidor que lo lea después ve la versión nueva.
        void refreshMe();
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  // La tab bar (4rem + safe-area) solo existe cuando el chrome se ve -
  // en contextos fullscreen (staff) el banner baja hasta el borde.
  const chromeHidden = CHROME_HIDDEN_PREFIXES.some((p) =>
    pathname.startsWith(p),
  );

  return (
    <div
      role="region"
      aria-label={t("bannerTitle")}
      className={`fixed inset-x-0 z-40 px-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-lg sm:-translate-x-1/2 lg:bottom-6 ${
        chromeHidden
          ? "bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
          : "bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)]"
      }`}
    >
      <div className="rounded-2xl border border-ink/15 bg-surface/95 p-4 shadow-xl shadow-black/40 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">
              {t("bannerTitle")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink/60">
              {t("bannerBody")}{" "}
              <Link
                href="/privacidad"
                className="font-medium text-neon underline-offset-4 hover:underline"
              >
                {t("bannerChanges")}
              </Link>
            </p>
            {/* Opt-ins GDPR (spec consent-por-jurisdiccion): solo en
                jurisdicción granular; el checkbox essential queda
                implícito en el botón Acepto. */}
            {granular && (
              <div className="mt-3 flex flex-col gap-2">
                {optionalScopes.map((scope) => (
                  <label
                    key={scope}
                    className="flex cursor-pointer items-start gap-2.5 text-left"
                  >
                    <input
                      type="checkbox"
                      checked={optIns[scope]}
                      onChange={(e) =>
                        setOptIns((prev) => ({
                          ...prev,
                          [scope]: e.target.checked,
                        }))
                      }
                      className="mt-0.5 size-4 shrink-0 accent-neon focus-visible:ring-2 focus-visible:ring-neon/50"
                    />
                    <span className="text-xs leading-snug text-ink/70">
                      {t(`scope.${scope}`)}
                    </span>
                  </label>
                ))}
              </div>
            )}
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
              className="mt-3 inline-flex min-h-11 items-center rounded-full bg-neon px-5 text-sm font-semibold text-on-accent transition-colors hover:bg-neon-soft active:scale-[0.97] disabled:opacity-60"
            >
              {t("bannerAccept")}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t("bannerDismiss")}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-ink/50 transition-colors hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
