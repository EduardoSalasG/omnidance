"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api";

export default function QrPage() {
  const t = useTranslations("qr");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unauth">("loading");

  useEffect(() => {
    let cancelled = false;

    async function mint() {
      const res = await apiFetch("/qr/mine");
      if (cancelled) return;
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

    mint();
    const interval = setInterval(mint, 50_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-sm text-white/60">{t("subtitle")}</p>
      {state === "unauth" ? (
        <Link
          href="/login"
          className="rounded-xl bg-neon px-5 py-3 font-semibold text-night-950"
        >
          {t("loginRequired")}
        </Link>
      ) : (
        <div className="rounded-2xl border border-night-700 bg-night-900 p-6">
          <canvas ref={canvasRef} role="img" aria-label={t("title")} />
          {state === "loading" && (
            <p
              role="status"
              className="mt-3 text-center text-sm text-white/50"
            >
              {t("refreshIn")}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
