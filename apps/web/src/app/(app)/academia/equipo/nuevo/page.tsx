"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { StaffForm } from "@/components/academy/staff-form";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/equipo/nuevo - alta de colaborador por email (stub +
 * invitación si no existe cuenta). El backend gatea con la capacidad
 * `team`: staff sin el flag recibe 403 al enviar.
 */
export default function AcademiaNuevoEquipoPage() {
  const t = useTranslations("academyStaff");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader backHref="/academia/equipo" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => <StaffForm key={academy.id} academyId={academy.id} />}
      </AcademyGate>
    </main>
  );
}
