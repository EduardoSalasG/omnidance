"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";

/**
 * Banner/card de opt-in para Web Push (VAPID).
 *
 * Visible solo cuando:
 * - existen Notification, serviceWorker y PushManager,
 * - Notification.permission === "default" (nunca si "denied" ni "granted"),
 * - hay NEXT_PUBLIC_VAPID_PUBLIC_KEY en el build,
 * - la usuaria no descartó el banner antes ("Ahora no" → localStorage).
 *
 * Flujo al aceptar:
 *   Notification.requestPermission()
 *   → serviceWorker.register("/sw.js") + serviceWorker.ready
 *   → pushManager.subscribe({ userVisibleOnly, applicationServerKey })
 *   → POST /api/push-tokens
 *
 * Contrato verificado en apps/api (RegisterPushTokenDto +
 * ValidationPipe whitelist): el body aceptado es `{ token, platform }` —
 * `token` = endpoint de la suscripción, platform ∈ WEB|IOS|ANDROID.
 * Enviamos además `keys` {p256dh, auth}: hoy el pipe las descarta (el DTO
 * aún no las declara ni el servicio las guarda en payload — gap del
 * backend), pero cuando se habilite la persistencia el cliente ya las
 * entrega en el formato que WebPushSender espera en payload.
 *
 * La VAPID public key sale de env porque el backend no expone endpoint
 * público para obtenerla (PushTokensController solo tiene POST/DELETE y
 * /api/params/public no la whitelistea).
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const DISMISS_KEY = "omnidance:push-optin-dismissed";

/** VAPID public key (base64url sin padding) → bytes para applicationServerKey. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** ArrayBuffer → base64url (formato de keys que espera web-push). */
function bufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

type Phase = "hidden" | "prompt" | "busy" | "done" | "error";

export function PushOptIn() {
  const t = useTranslations("realtime.push");
  const [phase, setPhase] = useState<Phase>("hidden");

  useEffect(() => {
    const supported =
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;
    if (
      supported &&
      Notification.permission === "default" &&
      Boolean(VAPID_PUBLIC_KEY) &&
      !wasDismissed()
    ) {
      setPhase("prompt");
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage bloqueado — el banner vuelve a aparecer en la próxima carga */
    }
    setPhase("hidden");
  }

  async function enable() {
    if (!VAPID_PUBLIC_KEY) return;
    setPhase("busy");
    try {
      const permission = await Notification.requestPermission();
      // "denied" → nada visible (queda a configuración manual del navegador).
      if (permission !== "granted") {
        setPhase("hidden");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      // Esperar a que el SW quede activo antes de suscribir.
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const keys = {
        p256dh: bufferToBase64Url(subscription.getKey("p256dh")),
        auth: bufferToBase64Url(subscription.getKey("auth")),
      };
      const res = await apiFetch("/push-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: subscription.endpoint,
          platform: "WEB",
          keys,
        }),
      });
      if (!res.ok) throw new Error(`push-tokens ${res.status}`);
      setPhase("done");
      window.setTimeout(() => setPhase("hidden"), 3000);
    } catch {
      setPhase("error");
    }
  }

  if (phase === "hidden") return null;

  return (
    <section
      aria-label={t("title")}
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-40 flex justify-center px-4"
    >
      <Card className="w-full max-w-md border-neon/30 bg-night-900/95 shadow-2xl shadow-black/50 backdrop-blur">
        {phase === "done" ? (
          <p className="text-sm font-medium text-neon">{t("enabled")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-semibold text-white">{t("title")}</p>
              <p className="mt-1 text-sm text-white/60">{t("description")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={enable}
                disabled={phase === "busy"}
              >
                {t("enable")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={dismiss}
                disabled={phase === "busy"}
              >
                {t("later")}
              </Button>
            </div>
            {phase === "error" && (
              <p role="alert" className="text-xs text-red-400">
                {t("error")}
              </p>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
