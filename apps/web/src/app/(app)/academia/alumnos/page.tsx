"use client";

import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyKpiStrip } from "@/components/academy/academy-kpi-strip";
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
  return (
    <div className="flex flex-col gap-6">
      {/* KPIs del mes de la academia - primera sección del módulo. */}
      <AcademyKpiStrip academyId={academyId} />
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
