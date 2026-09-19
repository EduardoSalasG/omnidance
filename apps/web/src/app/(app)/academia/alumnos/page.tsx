"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { StudentsSection } from "@/components/academy/students-section";
import { ConsoleHeader } from "@/components/console/console-header";
import type { MembershipPlan } from "@/components/academy/shared";

/**
 * /academia/alumnos — enrollments de la academia seleccionada.
 * La página fetchea GET /academies/:id/plans (StudentsSection los usa en
 * el select del alta); la lista de alumnos la carga la propia sección.
 */
export default function AcademiaAlumnosPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <StudentsModule key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}

function StudentsModule({ academyId }: { academyId: string }) {
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
    <StudentsSection academyId={academyId} plans={plans} onChanged={reload} />
  );
}
