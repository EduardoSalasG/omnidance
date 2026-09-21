"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Chip "Cerca de ti": pide geolocalización (opt-in del navegador) y navega a
 * /eventos?near=lat,lng preservando los filtros activos. El sort por
 * distancia lo hace el SSR — este componente solo obtiene la posición.
 */
export function NearMeButton({ className = "" }: { className?: string }) {
  const t = useTranslations("events");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"idle" | "pending" | "denied">("idle");

  function locate() {
    if (state === "pending" || !navigator.geolocation) {
      if (!navigator.geolocation) setState("denied");
      return;
    }
    setState("pending");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set(
          "near",
          `${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`,
        );
        router.push(`/eventos?${params.toString()}`);
      },
      () => setState("denied"),
      { timeout: 10000 },
    );
  }

  return (
    <span className={`inline-flex shrink-0 items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={locate}
        disabled={state === "pending"}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/15 px-4 text-sm font-medium text-white/60 transition-colors hover:border-white/30 hover:text-white active:scale-[0.97] disabled:opacity-50"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          <circle cx="12" cy="12" r="8" />
        </svg>
        {state === "pending" ? t("nearLocating") : t("near")}
      </button>
      {state === "denied" && (
        <span role="status" className="text-xs text-white/50">
          {t("nearDenied")}
        </span>
      )}
    </span>
  );
}
