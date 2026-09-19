"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { PlansSection } from "@/components/academy/plans-section";
import { ConsoleHeader } from "@/components/console/console-header";
import type { MembershipPlan } from "@/components/academy/shared";

/**
 * /academia/planes — membresías de la academia seleccionada.
 * La página fetchea GET /academies/:id/plans; el alta y el refresh los
 * maneja PlansSection vía onChanged.
 */
export default function AcademiaPlanesPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader
        backHref="/academia"
        backLabel={t("title")}
        title={t("plans")}
      />
      <AcademyGate>
        {({ academy }) => (
          <PlansModule key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}

function PlansModule({ academyId }: { academyId: string }) {
  const tc = useTranslations("common");
  const [plans, setPlans] = useState<MembershipPlan[] | null>(null);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/academies/${academyId}/plans`);
      if (!res.ok) {
        setError(true);
        return;
      }
      setPlans((await res.json()) as MembershipPlan[]);
    } catch {
      setError(true);
    }
  }, [academyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-white/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void reload()}>
          ↻ {tc("retry")}
        </Button>
      </div>
    );
  }
  if (plans === null) {
    return (
      <p role="status" className="text-sm text-white/60">
        {tc("loading")}
      </p>
    );
  }
  return (
    <PlansSection academyId={academyId} plans={plans} onChanged={reload} />
  );
}
