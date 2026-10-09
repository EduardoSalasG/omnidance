"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { useActiveRole } from "@/lib/active-role";
import { PageLoading } from "@/components/ui";
import { TeachingClasses } from "@/components/academy/teaching-classes";
import { AcademyKpiStrip } from "@/components/academy/academy-kpi-strip";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/clases - consola del instructor: clases asignadas (~30d) con
 * quórum. Sin AcademyGate: GET /classes/teaching es por persona y
 * cross-academia (el contrato trae academyName por ítem, no academyId) -
 * el componente resuelve sus propios estados 401/403/error/empty.
 *
 * La lente ACADEMY_OWNER no tiene acceso (spec academies/staff-roles):
 * la página no aporta nada al dueño (el endpoint responde 403) → se
 * redirige a /inicio. Un owner que también enseña la abre con la lente
 * INSTRUCTOR.
 */
export default function AcademiaClasesPage() {
  const t = useTranslations("academy");
  const ti = useTranslations("instructor");
  const router = useRouter();
  const { me, loading } = useMe();
  const activeRole = useActiveRole(me?.roles);
  const ownerLens = !loading && activeRole === "ACADEMY_OWNER";

  useEffect(() => {
    if (ownerLens) router.replace("/inicio");
  }, [ownerLens, router]);

  // Mientras /me resuelve (o durante el redirect del owner) no se
  // renderiza la consola - evita el flash del gate de instructor.
  if (loading || ownerLens) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
        <PageLoading />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      {/* KPIs del mes - el strip se auto-resuelve (esta consola no usa
          AcademyGate: el instructor puede no ser owner); sin academia
          propia no renderiza nada. */}
      <AcademyKpiStrip />
      <section aria-label={ti("title")} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{ti("title")}</h2>
        <TeachingClasses />
      </section>
    </main>
  );
}
