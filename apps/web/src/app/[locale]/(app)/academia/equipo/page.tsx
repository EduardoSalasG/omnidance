"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyTierGate } from "@/components/academy/academy-tier-gate";
import { academyHasFeature } from "@/lib/academy-features";
import { StaffSection } from "@/components/academy/staff-section";
import { InstructorSection } from "@/components/academy/instructor-section";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/equipo - mantenedor de colaboradores (spec academy-staff-roles).
 * El alta vive en /academia/equipo/nuevo detrás del CTA del header.
 * El backend gatea con la capacidad `team`: el owner siempre entra; staff
 * sin el flag recibe 403 y la sección muestra la lista vacía.
 */
export default function AcademiaEquipoPage() {
  const t = useTranslations("academyStaff");
  const ta = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <AcademyGate>
        {({ academy }) => (
          <>
            {/* El CTA de crear respeta el tier (spec
                academy-console-cta-gating): sin feature `staff` el
                alta no se ofrece fuera del paywall. */}
            <ConsoleHeader
              backHref="/academia"
              backLabel={ta("title")}
              actions={
                academyHasFeature(academy, "staff") ? (
                  <Button href="/academia/equipo/nuevo" size="sm">
                    + {t("addTitle")}
                  </Button>
                ) : undefined
              }
            />
            <AcademyTierGate academy={academy} feature="staff"><>
              <InstructorSection
                key={`i-${academy.id}`}
                academyId={academy.id}
              />
              <StaffSection key={`s-${academy.id}`} academyId={academy.id} />
            </></AcademyTierGate>
          </>
        )}
      </AcademyGate>
    </main>
  );
}
