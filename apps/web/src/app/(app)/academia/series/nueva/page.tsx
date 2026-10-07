"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, RefreshIcon, SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { SeriesForm } from "@/components/academy/series-form";
import { ConsoleHeader } from "@/components/console/console-header";
import type { Series } from "@/components/academy/shared";

type LoadState = "loading" | "ready" | "notFound" | "error";

/**
 * /academia/series/nueva - crear serie de clases; ?edit=<seriesId>
 * precarga la serie y hace PATCH (solo metadatos). No hay endpoint de
 * detalle individual: en modo edición se fetchea GET /academies/:id/series
 * y se busca por id.
 */
function NuevaSerie() {
  const t = useTranslations("academySeries");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader backHref="/academia/series" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <SeriesFormLoader key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}

function SeriesFormLoader({ academyId }: { academyId: string }) {
  const t = useTranslations("academySeries");
  const tc = useTranslations("common");
  const editId = useSearchParams().get("edit");

  const [series, setSeries] = useState<Series | null>(null);
  const [state, setState] = useState<LoadState>(editId ? "loading" : "ready");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    setState("loading");
    apiFetch(`/academies/${academyId}/series`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState("error");
          return;
        }
        const list = (await res.json()) as Series[];
        const found = list.find((s) => s.id === editId) ?? null;
        setSeries(found);
        setState(found ? "ready" : "notFound");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [academyId, editId, nonce]);

  // Sin ?edit el modo es crear - el short-circuit evita que una serie
  // precargada de una navegación previa (?edit=A → sin query, misma
  // página montada) quede en el formulario.
  if (!editId) {
    return <SeriesForm academyId={academyId} editing={null} />;
  }
  if (state === "loading") {
    return <SkeletonList />;
  }
  if (state === "error") {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-white/60">
          {tc("error")}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setNonce((n) => n + 1)}
        >
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (state === "notFound") {
    return (
      <p role="alert" className="text-sm text-white/60">
        {t("notFound")}
      </p>
    );
  }
  return <SeriesForm academyId={academyId} editing={series} />;
}

export default function AcademiaNuevaSeriePage() {
  return (
    <Suspense
      fallback={<main className="min-h-dvh bg-night-950" aria-hidden="true" />}
    >
      <NuevaSerie />
    </Suspense>
  );
}
