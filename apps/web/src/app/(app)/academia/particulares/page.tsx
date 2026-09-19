"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { PrivateLessons } from "@/components/academy/private-lessons";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/particulares — clases particulares 1:1. Vista staff (lista +
 * acciones sobre la academia seleccionada) y vista alumno ("mis
 * solicitudes" + form de request) dentro de PrivateLessons.
 */
export default function AcademiaParticularesPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader
        backHref="/academia"
        backLabel={t("title")}
        title={t("modules.lessons")}
      />
      <AcademyGate>
        {({ academy, academies }) => (
          <PrivateLessons
            key={academy.id}
            academy={academy}
            academies={academies}
          />
        )}
      </AcademyGate>
    </main>
  );
}
