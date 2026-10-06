"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ImportSection } from "@/components/academy/import-section";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/importar - carga masiva CSV de alumnos y horario semanal
 * (spec academy-bulk-import). Cada sección se muestra según la
 * capacidad del viewer; el backend gatea con `students`/`schedule`.
 */
export default function AcademiaImportarPage() {
  const t = useTranslations("academyImport");
  const ta = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader backHref="/academia" backLabel={ta("title")} />
      <AcademyGate>
        {({ academy }) => (
          <>
            <h1 className="sr-only">{t("title")}</h1>
            <ImportSection key={academy.id} academyId={academy.id} />
          </>
        )}
      </AcademyGate>
    </main>
  );
}
