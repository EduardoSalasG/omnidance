"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { PrivateLessons } from "@/components/academy/private-lessons";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/particulares — clases particulares 1:1, vista staff (lista +
 * acciones sobre la academia seleccionada) e instructor dentro de
 * PrivateLessons. La vista alumno vive en reservadas de /clases
 * (particulares-en-reservadas).
 */
export default function AcademiaParticularesPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
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
