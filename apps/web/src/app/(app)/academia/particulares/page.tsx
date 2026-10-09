"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { PrivateLessons } from "@/components/academy/private-lessons";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/particulares - clases particulares 1:1, vista staff:
 * solicitudes + agendamiento sobre la academia seleccionada (spec
 * academy-console-v3 - la comisión salió del producto; el acuerdo
 * económico del profesor se gestiona en equipo). La vista alumno vive
 * en reservadas de /clases (particulares-en-reservadas).
 */
export default function AcademiaParticularesPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <PrivateLessons key={academy.id} academy={academy} />
        )}
      </AcademyGate>
    </main>
  );
}
