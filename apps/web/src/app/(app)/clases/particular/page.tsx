"use client";

import { useTranslations } from "next-intl";
import { PrivateLessons } from "@/components/academy/private-lessons";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /clases/particular — clases particulares 1:1 del lado alumno:
 * "mis solicitudes" + form de request (la vista learner de
 * PrivateLessons, sin `academy`). La bandeja staff
 * (confirmar/reagendar/cancelar) sigue en /academia/particulares.
 */
export default function ClaseParticularPage() {
  const t = useTranslations("academyExtras.lessons");
  const tc = useTranslations("classes");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader backHref="/clases" backLabel={tc("title")} />
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <PrivateLessons />
    </main>
  );
}
