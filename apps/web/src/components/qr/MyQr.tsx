"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api";
import { Button, RefreshIcon } from "@/components/ui";

/**
 * QR personal rotativo (TOTP ~30s server-side; se re-emite cada 50s).
 * Se monta dentro del hub /qr — sin <main> propio, el hub da el chrome.
 *
 * Fallo de /qr/mine (red, 5xx, body sin token) → estado "error" con
 * retry: antes quedaba en loading eterno con "Se renueva solo". El
 * canvas queda montado durante el error — si el último QR aún es
 * válido sigue a la vista mientras se reintenta (pantalla de puerta).
 */
export function MyQr({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("qr");
  const tc = useTranslations("common");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelledRef = useRef(false);
  const [state, setState] = useState<
    "loading" | "ready" | "unauth" | "error"
  >("loading");

  const mint = useCallback(async () => {
    const res = await apiFetch("/qr/mine").catch(() => null);
    if (cancelledRef.current) return;
    if (!res) {
      setState("error");
      return;
    }
    if (res.status === 401) {
      setState("unauth");
      return;
    }
    if (!res.ok) {
      setState("error");
      return;
    }
    const body = (await res.json().catch(() => null)) as {
      token?: unknown;
    } | null;
    if (cancelledRef.current) return;
    const token = typeof body?.token === "string" ? body.token : null;
    if (!token) {
      setState("error");
      return;
    }
    if (canvasRef.current) {
      try {
        await QRCode.toCanvas(canvasRef.current, token, {
          width: compact ? 200 : 280,
          margin: 2,
          color: { dark: "#ffffff", light: "#0a0a0f" },
        });
      } catch {
        if (!cancelledRef.current) setState("error");
        return;
      }
    }
    setState("ready");
  }, [compact]);

  useEffect(() => {
    cancelledRef.current = false;
    void mint();
    const interval = setInterval(mint, 50_000);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [mint]);

  function retry() {
    setState("loading");
    void mint();
  }

  if (state === "unauth") {
    return (
      <div className="flex flex-col items-center gap-6 py-10 text-center">
        <p className="text-sm text-white/60">{t("subtitle")}</p>
        <Link
          href="/login"
          className="rounded-xl bg-neon px-5 py-3 font-semibold text-night-950"
        >
          {t("loginRequired")}
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center ${compact ? "gap-3" : "gap-6 py-4"}`}
    >
      {!compact && <p className="text-sm text-white/60">{t("subtitle")}</p>}
      <div
        className={`rounded-2xl border border-night-700 bg-night-900 ${compact ? "p-3" : "p-6"}`}
      >
        <canvas ref={canvasRef} role="img" aria-label={t("title")} />
        {state === "loading" && (
          <p role="status" className="mt-3 text-center text-sm text-white/50">
            {t("refreshIn")}
          </p>
        )}
        {state === "error" && (
          <div className="mt-3 flex flex-col items-center gap-3">
            <p
              role="alert"
              className="text-center text-sm font-medium text-white/80"
            >
              {t("loadError")}
            </p>
            <Button size="sm" onClick={retry}>
              <RefreshIcon /> {tc("retry")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
