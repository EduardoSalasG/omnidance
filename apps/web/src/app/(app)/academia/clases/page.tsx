"use client";

import { useTranslations } from "next-intl";
import { TeachingClasses } from "@/components/academy/teaching-classes";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/clases — consola del instructor: clases asignadas (~30d) con
 * quórum. Sin AcademyGate: GET /classes/teaching es por persona y
 * cross-academia (el contrato trae academyName por ítem, no academyId) —
 * el componente resuelve sus propios estados 401/403/error/empty.
 */
export default function AcademiaClasesPage() {
  const t = useTranslations("academy");
  const ti = useTranslations("instructor");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <section aria-label={ti("title")} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{ti("title")}</h2>
        <TeachingClasses />
      </section>
    </main>
  );
}
