"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyProfile } from "@/components/academy/academy-profile";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/configuracion/perfil - perfil público de la academia (lo que
 * ven los bailarines en la ficha y el mapa). Destino directo del
 * drawer: el ConsoleHeader declara el back al hub.
 */
export default function ConfigPerfilPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <AcademyProfile key={academy.id} academy={academy} />
        )}
      </AcademyGate>
    </main>
  );
}
