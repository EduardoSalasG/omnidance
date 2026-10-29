"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ImportCard } from "@/components/academy/import-section";
import { useAcademyAccess } from "@/components/academy/use-academy-access";

/**
 * /academia/configuracion/importar - cargas masivas CSV de la academia.
 * Agrupa las importaciones one-shot (alumnos, clases) que antes vivían
 * embebidas en /academia/alumnos y /academia/series: son setup de una
 * vez, no operación diaria - por eso van en Configuración.
 * Cada card se muestra solo si el viewer tiene el cap correspondiente
 * (students/schedule) - el backend gatea igual en /import/:kind.
 */
export default function ConfigImportarPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-4xl lg:px-8">
      <AcademyGate>
        {({ academy }) => (
          <ImportSection key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}

function ImportSection({ academyId }: { academyId: string }) {
  const t = useTranslations("academyImport");
  const access = useAcademyAccess(academyId);
  const canStudents = access?.caps.students === true;
  const canSchedule = access?.caps.schedule === true;

  // Sin caps (staff sin permisos, o resolviendo): la página queda vacía
  // intencional - el backend igual devuelve 403 en /import/:kind.
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
      </header>
      {canStudents && <ImportCard academyId={academyId} kind="students" />}
      {canSchedule && <ImportCard academyId={academyId} kind="schedule" />}
    </div>
  );
}
