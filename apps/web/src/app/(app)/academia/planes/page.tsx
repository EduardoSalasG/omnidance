"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { PlansSection } from "@/components/academy/plans-section";
import { ConsoleHeader } from "@/components/console/console-header";
import type { MembershipPlan } from "@/components/academy/shared";

/**
 * /academia/planes - membresías de la academia seleccionada.
 * La página fetchea GET /academies/:id/plans; crear/editar vive en
 * /academia/planes/nueva (?edit=<planId>) detrás del CTA del header.
 */
export default function AcademiaPlanesPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader
        backHref="/academia"
        backLabel={t("title")}
        actions={
          <Button href="/academia/planes/nueva" size="sm">
            + {t("newPlan")}
          </Button>
        }
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
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (plans === null) {
    return <SkeletonList />;
  }
  return <PlansSection plans={plans} />;
}
