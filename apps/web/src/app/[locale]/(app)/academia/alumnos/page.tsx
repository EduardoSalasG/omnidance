"use client";

import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { useActiveRole } from "@/lib/active-role";
import { SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyKpiStrip } from "@/components/academy/academy-kpi-strip";
import { StudentsInsights } from "@/components/academy/students-insights";
import { StudentsSection } from "@/components/academy/students-section";
import { useAcademyAccess } from "@/components/academy/use-academy-access";
import { academyTierHas } from "@/lib/academy-features";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";

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
            tier={academy.tier}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function StudentsModule({
  academyId,
  ownerId,
  tier,
}: {
  academyId: string;
  ownerId: string;
  tier?: string | null;
}) {
  // Permiso desde el /me compartido - null mientras resuelve (el
  // skeleton espera), false si no es admin/owner → readOnly.
  const { me, loading: meLoading } = useMe();
  // La lente INSTRUCTOR degrada la vista a instructor puro aunque la
  // persona tenga roles más privilegiados (spec academies/staff-roles):
  // la única mutación del instructor es asistencia de sus clases.
  const instructorLens =
    useActiveRole(me?.roles) === "INSTRUCTOR" && !meLoading;
  const canAdminister: boolean | null = meLoading
    ? null
    : !instructorLens &&
      !!me &&
      (me.roles.includes("ADMIN") || me.id === ownerId);

  // Carga masiva de alumnos: vive en /academia/configuracion/importar
  // (cap `students` - el backend gatea igual en /import/:kind).
  const access = useAcademyAccess(academyId);
  // KPIs e insights son feature PRO del tier (spec
  // unified-actor-entitlements + academy-tier-v2): ocultar el bloque
  // evita el 403 tier.required inline en COBROS/STUDIO. Se deriva del
  // `tier` que ya viaja en /academies/mine - funciona igual para owner,
  // staff e instructor (los entitlements solo cubren al owner).
  const canInsights = academyTierHas(tier, "insights");

  if (canAdminister === null) {
    return <SkeletonList />;
  }
  // KPIs, insights e importación son superficies de gestión (cap
  // `students`): el instructor pasa `requireManage` para LEER la lista
  // pero no administra - su vista es solo el listado navegable (spec
  // academies/staff-roles). Bajo la lente INSTRUCTOR nunca se muestran,
  // aunque la persona tenga más privilegios reales.
  const manages =
    !instructorLens &&
    (canAdminister === true || access?.caps.students === true);
  const showInsights = manages && canInsights;
  return (
    <div className="flex flex-col gap-6">
      {showInsights && (
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
        tier={tier}
        readOnly={canAdminister !== true}
      />
      {/* Tour de primera visita del módulo: los anchors de gestión
          (KPIs, insights, alta, importación) solo existen para quien
          administra - el runner filtra los ausentes y el instructor
          recibe solo los pasos de filtros/lista. */}
      <AlumnosTour />
    </div>
  );
}

function AlumnosTour() {
  const tt = useTranslations("tours.academia-alumnos");
  return (
    <OnboardingRunner
      tour="academia-alumnos"
      steps={
        [
          {
            element: "[data-tour='academy-kpis']",
            title: tt("s1.title"),
            description: tt("s1.desc"),
            side: "top",
          },
          {
            element: "[data-tour='academy-alumnos-insights']",
            title: tt("s2.title"),
            description: tt("s2.desc"),
            side: "top",
          },
          {
            element: "[data-tour='academy-alumnos-filters']",
            title: tt("s3.title"),
            description: tt("s3.desc"),
            side: "top",
          },
          {
            element: "[data-tour='academy-alumnos-list']",
            title: tt("s4.title"),
            description: tt("s4.desc"),
            side: "top",
          },
          {
            element: "[data-tour='academy-alumnos-new']",
            title: tt("s5.title"),
            description: tt("s5.desc"),
            side: "bottom",
          },
          {
            element: "[data-tour='academy-alumnos-import']",
            title: tt("s6.title"),
            description: tt("s6.desc"),
            side: "top",
          },
        ] satisfies TourStep[]
      }
    />
  );
}
