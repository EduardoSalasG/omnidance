"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, RefreshIcon, SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { PlanForm } from "@/components/academy/plan-form";
import { ConsoleHeader } from "@/components/console/console-header";
import type { MembershipPlan } from "@/components/academy/shared";

type LoadState = "loading" | "ready" | "notFound" | "error";

/**
 * /academia/planes/nueva - crear plan de membresía; ?edit=<planId>
 * precarga el plan y hace PATCH. No hay endpoint de detalle individual:
 * en modo edición se fetchea GET /academies/:id/plans y se busca por id.
 */
function NuevaPlan() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader backHref="/academia/planes" backLabel={t("plans")} />
      <AcademyGate>
        {({ academy }) => (
          <PlanFormLoader key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}

function PlanFormLoader({ academyId }: { academyId: string }) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const editId = useSearchParams().get("edit");

  const [plan, setPlan] = useState<MembershipPlan | null>(null);
  const [state, setState] = useState<LoadState>(editId ? "loading" : "ready");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    setState("loading");
    apiFetch(`/academies/${academyId}/plans`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState("error");
          return;
        }
        const plans = (await res.json()) as MembershipPlan[];
        const found = plans.find((p) => p.id === editId) ?? null;
        setPlan(found);
        setState(found ? "ready" : "notFound");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [academyId, editId, nonce]);

  // Sin ?edit el modo es crear - el short-circuit evita que un plan
  // precargado de una navegación previa (?edit=A → sin query, misma
  // página montada) quede en el formulario.
  if (!editId) {
    return <PlanForm academyId={academyId} plan={null} />;
  }
  if (state === "loading") {
    return <SkeletonList />;
  }
  if (state === "error") {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
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
      <p role="alert" className="text-sm text-ink/60">
        {t("planNotFound")}
      </p>
    );
  }
  return <PlanForm academyId={academyId} plan={plan} />;
}

export default function AcademiaNuevaPlanPage() {
  return (
    <Suspense
      fallback={<main className="min-h-dvh bg-canvas" aria-hidden="true" />}
    >
      <NuevaPlan />
    </Suspense>
  );
}
