"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/spinner";
import { PrivateLessons } from "@/components/academy/private-lessons";

// /academias — directorio para alumnos (vista "Mi Aprendizaje" del modo
// Academia): academias activas con sus instructores + debajo el módulo
// de clases particulares (mis solicitudes + form de request), que ya
// consume el mismo GET /academies.
type DirectoryAcademy = {
  id: string;
  name: string;
  instructors: { id: string; personId: string; name: string | null }[];
};

export default function AcademiasPage() {
  const t = useTranslations("academy");
  const [academies, setAcademies] = useState<DirectoryAcademy[] | null>(null);

  useEffect(() => {
    apiFetch("/academies")
      .then(async (res) =>
        res.ok ? ((await res.json()) as DirectoryAcademy[]) : [],
      )
      .then(setAcademies)
      .catch(() => setAcademies([]));
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 py-6 sm:px-6">
      <section
        aria-label={t("directoryTitle")}
        className="flex flex-col gap-3"
      >
        <h2 className="text-lg font-semibold">{t("directoryTitle")}</h2>
        {academies === null ? (
          <Spinner size="sm" className="page-loading" />
        ) : academies.length === 0 ? (
          <p className="text-sm text-white/60">{t("directoryEmpty")}</p>
        ) : (
          <ul className="grid gap-3">
            {academies.map((a) => (
              <li key={a.id}>
                <Card className="p-4">
                  <p className="font-semibold">{a.name}</p>
                  {a.instructors.length > 0 && (
                    <p className="mt-1 text-sm text-white/50">
                      {t("instructorsLabel")}:{" "}
                      {a.instructors
                        .map((i) => i.name)
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Vista alumno: mis solicitudes + form para pedir clase particular. */}
      <PrivateLessons />
    </main>
  );
}
