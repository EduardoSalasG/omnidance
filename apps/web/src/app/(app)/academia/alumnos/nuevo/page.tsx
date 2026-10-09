"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, RefreshIcon, SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { EnrollmentForm } from "@/components/academy/enrollment-form";
import { ConsoleHeader } from "@/components/console/console-header";
import type { MembershipPlan } from "@/components/academy/shared";

/**
 * /academia/alumnos/nuevo - alta de enrollment. Los planes para el
 * select se fetchean aquí (GET /academies/:id/plans) solo si el usuario
 * puede administrar - el endpoint es requireAdminister y un instructor
 * recibiría 403 (misma regla canAdminister que /academia/alumnos).
 */
export default function AcademiaNuevoAlumnoPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader backHref="/academia/alumnos" backLabel={t("students")} />
      <AcademyGate>
        {({ academy }) => (
          <EnrollmentLoader
            key={academy.id}
            academyId={academy.id}
            ownerId={academy.ownerId}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function EnrollmentLoader({
  academyId,
  ownerId,
}: {
  academyId: string;
  ownerId: string;
}) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");

  // Permiso desde el /me compartido - null mientras resuelve.
  const { me, loading: meLoading } = useMe();
  const canAdminister: boolean | null = meLoading
    ? null
    : !!me && (me.roles.includes("ADMIN") || me.id === ownerId);

  const [plans, setPlans] = useState<MembershipPlan[] | null>(null);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (canAdminister !== true) return;
    let cancelled = false;
    setError(false);
    apiFetch(`/academies/${academyId}/plans?pageSize=100`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        setPlans(
          ((await res.json()) as { items: MembershipPlan[] }).items,
        );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [academyId, canAdminister, nonce]);

  if (canAdminister === null || (canAdminister && plans === null && !error)) {
    return <SkeletonList />;
  }
  if (canAdminister === false) {
    return (
      <p role="alert" className="text-sm text-ink/60">
        {t("forbidden")}
      </p>
    );
  }
  if (error) {
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
  return <EnrollmentForm academyId={academyId} plans={plans ?? []} />;
}
