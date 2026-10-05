"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CONSENT_VERSION } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { CHROME_HIDDEN_PREFIXES } from "@/components/layout/BottomNav";
import { XIcon } from "@/components/ui";

// Evento diferido de instalación (Chromium). TS no lo trae en lib.dom.
type BipEvent = Event & {
  prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Invita a instalar la PWA tras iniciar sesión:
 * - Chromium (Android/desktop): captura `beforeinstallprompt` y ofrece
 *   el prompt nativo al tocar "Instalar".
 * - iOS: no existe prompt programático - muestra las instrucciones
 *   (Compartir → "Agregar a pantalla de inicio").
 * Se oculta si la app ya corre instalada (display-mode standalone /
 * navigator.standalone), si el usuario la descartó antes
 * (onboarding["install-prompt"], persistente), en contextos sin chrome
 * (staff puerta) y mientras el banner de consentimiento ocupa el slot.
 */
export function InstallPrompt() {
  const t = useTranslations("install");
  const pathname = usePathname();
  const { me, loading, refresh: refreshMe } = useMe();
  const [deferred, setDeferred] = useState<BipEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  async function markSeen() {
    try {
      await apiFetch("/me/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tour: "install-prompt" }),
      });
      void refreshMe();
    } catch {
      // Best effort: peor caso el aviso reaparece en otra sesión.
    }
  }

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) setInstalled(true);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    function onBip(e: Event) {
      e.preventDefault();
      setDeferred(e as BipEvent);
    }
    function onInstalled() {
      setInstalled(true);
      void markSeen();
    }
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !me || installed) return null;
  if (me.onboarding?.["install-prompt"]) return null;
  // El banner de consentimiento legal ocupa el mismo slot - gana él.
  if (!me.consentAcceptedAt || me.consentVersion !== CONSENT_VERSION) {
    return null;
  }
  if (CHROME_HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }
  // Chromium espera el evento; iOS muestra instrucciones; otros
  // browsers (Firefox escritorio, webviews) no tienen flujo → nada.
  if (!deferred && !isIos) return null;

  async function install() {
    if (!deferred) return;
    const { outcome } = await deferred.prompt();
    if (outcome === "accepted") {
      setInstalled(true);
      void markSeen();
    } else {
      setDeferred(null);
    }
  }

  return (
    <div
      role="region"
      aria-label={t("title")}
      className="fixed inset-x-0 z-40 px-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-lg sm:-translate-x-1/2 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)]"
    >
      <div className="rounded-2xl border border-white/15 bg-night-900/95 p-4 shadow-xl shadow-black/40 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">{t("title")}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/60">
              {deferred ? t("body") : t("iosBody")}
            </p>
            {deferred && (
              <button
                type="button"
                onClick={() => void install()}
                className="mt-3 inline-flex min-h-11 items-center rounded-full bg-neon px-5 text-sm font-semibold text-night-950 transition-colors hover:bg-neon-soft active:scale-[0.97]"
              >
                {t("cta")}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => void markSeen()}
            aria-label={t("dismiss")}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:text-white"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
