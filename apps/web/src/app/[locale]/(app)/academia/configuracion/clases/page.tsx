"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademySettings } from "@/components/academy/academy-settings";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/configuracion/clases - "Valores por defecto" de las clases
 * de la academia (quórum por defecto, precio de clase particular).
 * Destino directo del drawer (isSidebarRoute): el ConsoleHeader declara
 * el back al hub pero no lo pinta en desktop.
 */
export default function ConfigGeneralPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <AcademySettings key={academy.id} academy={academy} />
        )}
      </AcademyGate>
    </main>
  );
}
