"use client";

import { useEffect, useState } from "react";
import { CONSENT_VERSION } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";

// Respuesta de GET /legal/consent (spec consent-por-jurisdiccion):
// texto vigente + scopes de la jurisdicción.
export type LegalConsent = {
  version: string;
  body: string;
  requiredScopes: string[];
  granular: boolean;
  jurisdiction: string;
};

// Scopes opcionales GDPR - `essential` es requerido, nunca opt-in.
export type OptionalConsentScope = "marketing" | "analytics";

export function optionalConsentScopes(
  legal: LegalConsent | null,
): OptionalConsentScope[] {
  return (legal?.requiredScopes ?? []).filter(
    (s): s is OptionalConsentScope => s === "marketing" || s === "analytics",
  );
}

export type LegalConsentState = {
  /** null hasta resolver (o definitivamente falló con `failed`). */
  legal: LegalConsent | null;
  /** Fetch terminó en error → usar CONSENT_VERSION como fallback. */
  failed: boolean;
  /** Versión vigente a comparar contra me.consentVersion. */
  currentVersion: string;
};

/**
 * Texto legal vigente por jurisdicción (spec consent-por-jurisdiccion)
 * - lo comparten ConsentBanner (render granular) e InstallPrompt (el
 * banner gana el slot cuando el consent está pendiente).
 * `enabled=false` → no hace fetch (sin sesión / todavía cargando /me).
 * Si el fetch falla, `failed` queda true y currentVersion cae al
 * baseline legacy - nunca bloquea la UI.
 */
export function useLegalConsent(
  jurisdiction: string | null | undefined,
  enabled: boolean,
): LegalConsentState {
  const [legal, setLegal] = useState<LegalConsent | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const jur = jurisdiction ?? "CL";
    apiFetch(`/legal/consent?jurisdiction=${encodeURIComponent(jur)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("legal consent fetch failed");
        const data = (await res.json()) as LegalConsent;
        if (!cancelled) setLegal(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, jurisdiction]);

  return {
    legal,
    failed,
    currentVersion: legal?.version ?? CONSENT_VERSION,
  };
}
