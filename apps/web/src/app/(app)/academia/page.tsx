"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyDashboard } from "@/components/academy/academy-dashboard";
import { AcademySettings } from "@/components/academy/academy-settings";
import { ModuleCard, ModuleGrid } from "@/components/console/module-grid";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";

// Módulos de la consola — keys de academy.modules.* en es-CL.json.
// "myClasses" primero: es la vista diaria del instructor (la consola se
// comparte con owner; si no imparte clases la lista sale vacía).
const MODULES = [
  { href: "/academia/clases", key: "myClasses" },
  { href: "/academia/planes", key: "plans" },
  { href: "/academia/alumnos", key: "students" },
  { href: "/academia/horarios", key: "slots" },
  { href: "/academia/series", key: "series" },
  { href: "/academia/asistencia", key: "attendance" },
  { href: "/academia/particulares", key: "lessons" },
  { href: "/academia/videos", key: "videos" },
  // CRM con actorType=ACADEMY — la API ya segmenta por academia; el
  // ActorPicker la resuelve via GET /academies/mine. Solo owner/ADMIN:
  // CRM_ROLES no incluye instructor (el card se filtra abajo).
  { href: "/crm", key: "crm", ownerOnly: true },
] as const;

/**
 * /academia — hub de la consola de academia. El gate (AcademyGate) resuelve
 * auth + academia seleccionada; adentro va el resumen (AcademyDashboard)
 * y la grilla de módulos hacia las subrutas.
 */
export default function AcademiaPage() {
  const t = useTranslations("academy");
  const tt = useTranslations("tours.academia");

  // /me para filtrar módulos owner-only (CRM) — academy.ownerId vs me.id.
  const [me, setMe] = useState<{ id: string; roles: string[] } | null>(null);
  useEffect(() => {
    apiFetch("/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d as { id: string; roles: string[] } | null))
      .catch(() => setMe(null));
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <p className="text-sm text-white/50">{t("hubDesc")}</p>

      <AcademyGate showStudentLessons>
        {({ academy }) => (
          <>
            {/* key por id: cambiar de academia remonta el resumen. */}
            <AcademyDashboard key={academy.id} academy={academy} />
            {/* Settings (quórum default) — solo owner/ADMIN; instructores
                no ven el card (canAdminister interno vía GET /me). */}
            <AcademySettings academy={academy} />
            <ModuleGrid>
              {MODULES.filter(
                (m) =>
                  !("ownerOnly" in m && m.ownerOnly) ||
                  me?.roles.includes("ADMIN") ||
                  me?.id === academy.ownerId,
              ).map((m) => (
                <ModuleCard
                  key={m.href}
                  href={m.href}
                  title={t(`modules.${m.key}`)}
                  desc={t(`modules.${m.key}Desc`)}
                />
              ))}
            </ModuleGrid>

            {/* Tour de primera visita — targets del chrome (tabs +
                menú lateral), presentes una vez pasa el gate. */}
            <OnboardingRunner
              tour="academia"
              steps={
                [
                  {
                    element: "[data-tour='nav-academy']",
                    title: tt("s1.title"),
                    description: tt("s1.desc"),
                    side: "top",
                  },
                  {
                    element: "[data-tour='nav-attendance']",
                    title: tt("s2.title"),
                    description: tt("s2.desc"),
                    side: "top",
                  },
                  {
                    element: "[data-tour='appbar-menu']",
                    title: tt("s3.title"),
                    description: tt("s3.desc"),
                    side: "bottom",
                  },
                ] satisfies TourStep[]
              }
            />
          </>
        )}
      </AcademyGate>
    </main>
  );
}
