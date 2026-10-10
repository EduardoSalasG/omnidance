"use client";

import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyKpiStrip } from "@/components/academy/academy-kpi-strip";
import { StudentsInsights } from "@/components/academy/students-insights";
import { StudentsSection } from "@/components/academy/students-section";
import { ImportCard } from "@/components/academy/import-section";
import { useAcademyAccess } from "@/components/academy/use-academy-access";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/alumnos - enrollments de la academia seleccionada.
 * El alta vive en /academia/alumnos/nuevo (la página dedicada fetchea
 * los planes ella misma); la lista de alumnos la carga la sección.
 */
export default function AcademiaAlumnosPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <StudentsModule
            key={academy.id}
            academyId={academy.id}
            ownerId={academy.ownerId}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function StudentsModule({
  academyId,
  ownerId,
}: {
  academyId: string;
  ownerId: string;
}) {
  // Permiso desde el /me compartido - null mientras resuelve (el
  // skeleton espera), false si no es admin/owner → readOnly.
  const { me, loading: meLoading } = useMe();
  const canAdminister: boolean | null = meLoading
    ? null
    : !!me && (me.roles.includes("ADMIN") || me.id === ownerId);

  // Carga masiva de alumnos embebida en el módulo (cap `students` -
  // owner/admin reportan todas; null mientras resuelve = no se muestra).
  const access = useAcademyAccess(academyId);

  if (canAdminister === null) {
    return <SkeletonList />;
  }
  // KPIs, insights e importación son superficies de gestión (cap
  // `students`): el instructor pasa `requireManage` para LEER la lista
  // pero no administra - su vista es solo el listado navegable (spec
  // academies/console-lists).
  const manages = canAdminister === true || access?.caps.students === true;
  return (
    <div className="flex flex-col gap-6">
      {manages && (
        <>
          {/* KPIs del módulo: solo alumnos activos + split de género con
              comparativa mensual (spec academies/owner-insights). */}
          <AcademyKpiStrip
            academyId={academyId}
            keys={["activeStudents", "pctMen", "pctWomen"]}
          />
          {/* Listas de insight tras los KPIs - mismo orden que el
              inicio. */}
          <StudentsInsights academyId={academyId} />
        </>
      )}
      <StudentsSection
        academyId={academyId}
        readOnly={canAdminister !== true}
      />
      {access?.caps.students === true && (
        <ImportCard academyId={academyId} kind="students" />
      )}
    </div>
  );
}
