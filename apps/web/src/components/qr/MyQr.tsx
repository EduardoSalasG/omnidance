"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api";

/**
 * QR personal rotativo (TOTP ~30s server-side; se re-emite cada 50s).
 * Se monta dentro del hub /qr — sin <main> propio, el hub da el chrome.
 */
export function MyQr() {
  const t = useTranslations("qr");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unauth">("loading");

  useEffect(() => {
    let cancelled = false;

    async function mint() {
      const res = await apiFetch("/qr/mine").catch(() => null);
      if (cancelled || !res) return;
      if (res.status === 401) {
        setState("unauth");
        return;
      }
      const { token } = await res.json();
      if (canvasRef.current) {
        await QRCode.toCanvas(canvasRef.current, token, {
          width: 280,
          margin: 2,
          color: { dark: "#ffffff", light: "#0a0a0f" },
        });
      }
      setState("ready");
    }

    void mint();
    const interval = setInterval(mint, 50_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

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
    <div className="flex flex-col items-center gap-6 py-4">
      <p className="text-sm text-white/60">{t("subtitle")}</p>
      <div className="rounded-2xl border border-night-700 bg-night-900 p-6">
        <canvas ref={canvasRef} role="img" aria-label={t("title")} />
        {state === "loading" && (
          <p role="status" className="mt-3 text-center text-sm text-white/50">
            {t("refreshIn")}
          </p>
        )}
      </div>
    </div>
  );
}
