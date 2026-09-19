"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyDashboard } from "@/components/academy/academy-dashboard";
import { ModuleCard, ModuleGrid } from "@/components/console/module-grid";

// Módulos de la consola — keys de academy.modules.* en es-CL.json.
const MODULES = [
  { href: "/academia/planes", key: "plans" },
  { href: "/academia/alumnos", key: "students" },
  { href: "/academia/horarios", key: "slots" },
  { href: "/academia/series", key: "series" },
  { href: "/academia/asistencia", key: "attendance" },
  { href: "/academia/particulares", key: "lessons" },
  { href: "/academia/videos", key: "videos" },
] as const;

/**
 * /academia — hub de la consola de academia. El gate (AcademyGate) resuelve
 * auth + academia seleccionada; adentro va el resumen (AcademyDashboard)
 * y la grilla de módulos hacia las subrutas.
 */
export default function AcademiaPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <p className="text-sm text-white/50">{t("hubDesc")}</p>

      <AcademyGate showStudentLessons>
        {({ academy }) => (
          <>
            {/* key por id: cambiar de academia remonta el resumen. */}
            <AcademyDashboard key={academy.id} academy={academy} />
            <ModuleGrid>
              {MODULES.map((m) => (
                <ModuleCard
                  key={m.href}
                  href={m.href}
                  title={t(`modules.${m.key}`)}
                  desc={t(`modules.${m.key}Desc`)}
                />
              ))}
            </ModuleGrid>
          </>
        )}
      </AcademyGate>
    </main>
  );
}
