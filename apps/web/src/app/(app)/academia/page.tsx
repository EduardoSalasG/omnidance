"use client";

import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyDashboard } from "@/components/academy/academy-dashboard";
import { AcademySettings } from "@/components/academy/academy-settings";
import { AcademyProfile } from "@/components/academy/academy-profile";
import { useAcademyAccess } from "@/components/academy/use-academy-access";
import { ModuleCard, ModuleGrid } from "@/components/console/module-grid";

import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";

// Módulos de la consola - keys de academy.modules.* en es-CL.json +
// parts/academyExtras.json + parts/academyBilling.json. `cap` mapea a los
// flags granulares de AcademyStaff (spec academy-staff-roles): el owner y
// ADMIN de plataforma reportan todos en GET /:id/access; staff e
// instructor solo ven lo que su acceso cubre. Sin `cap` = nivel operativo
// (owner, instructor o cualquier staff - requireManage del backend).
const MODULES = [
  { href: "/academia/clases", key: "myClasses" },
  { href: "/academia/planes", key: "plans", cap: "plans" },
  { href: "/academia/alumnos", key: "students" },
  { href: "/academia/horarios", key: "slots", cap: "schedule" },
  { href: "/academia/series", key: "series", cap: "schedule" },
  { href: "/academia/asistencia", key: "attendance" },
  { href: "/academia/particulares", key: "lessons" },
  { href: "/academia/videos", key: "videos", cap: "schedule" },
  { href: "/academia/cobros", key: "payments", cap: "payments" },
  { href: "/academia/equipo", key: "team", cap: "team" },
  { href: "/academia/importar", key: "import", capAny: ["students", "schedule"] },
  // CRM con actorType=ACADEMY: sigue owner/ADMIN-only (requireAdminister
  // del backend - no es delegable por flags).
  { href: "/crm", key: "crm", ownerOnly: true },
  { href: "/academia/suscripcion", key: "subscription", cap: "billing" },
] as const;

/**
 * /academia - hub de la consola de academia. El gate (AcademyGate) resuelve
 * auth + academia seleccionada; adentro va el resumen (AcademyDashboard)
 * y la grilla de módulos hacia las subrutas.
 */
export default function AcademiaPage() {
  const t = useTranslations("academy");
  const tt = useTranslations("tours.academia");

  // /me compartido para filtrar módulos owner-only (cobros/CRM/
  // suscripción) - academy.ownerId vs me.id. Mientras resuelve los
  // owner-only no pintan (aparecen una vez si aplica - un skeleton que
  // colapsa para el no-owner sería flash).
  const { me } = useMe();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <p className="text-sm text-white/50">{t("hubDesc")}</p>

      <AcademyGate>
        {({ academy }) => (
          <AcademyHub academy={academy} t={t} tt={tt} me={me} />
        )}
      </AcademyGate>
    </main>
  );
}

// Contenido del hub separado para poder llamar useAcademyAccess por
// academia (el hook depende del id seleccionado en el gate).
function AcademyHub({
  academy,
  t,
  tt,
  me,
}: {
  academy: Parameters<
    Parameters<typeof AcademyGate>[0]["children"]
  >[0]["academy"];
  t: ReturnType<typeof useTranslations>;
  tt: ReturnType<typeof useTranslations>;
  me: ReturnType<typeof useMe>["me"];
}) {
  const access = useAcademyAccess(academy.id);

  // Mientras /access resuelve (null) se muestran los módulos operativos
  // (los del día a día que el gate ya garantiza) - mismo criterio que el
  // filtro owner-only previo: sin skeleton para no causar flash.
  const operational =
    access === null ||
    access.isOwner ||
    access.isAdmin ||
    access.isInstructor ||
    access.isStaff;

  const visible = MODULES.filter((m) => {
    if ("ownerOnly" in m && m.ownerOnly) {
      return (
        access?.isAdmin === true ||
        access?.isOwner === true ||
        me?.roles.includes("ADMIN") ||
        me?.id === academy.ownerId
      );
    }
    if ("cap" in m && m.cap) {
      return access?.caps[m.cap] === true;
    }
    if ("capAny" in m && m.capAny) {
      return m.capAny.some((c) => access?.caps[c] === true);
    }
    return operational;
  });

  return (
    <>
      {/* key por id: cambiar de academia remonta el resumen. */}
      <AcademyDashboard key={academy.id} academy={academy} />
      {/* Settings (quórum default) y perfil público - capacidad profile;
          el componente decide solo si no tiene acceso. */}
      <AcademySettings academy={academy} />
      <AcademyProfile academy={academy} />
      <ModuleGrid>
        {visible.map((m) => (
          <ModuleCard
            key={m.href}
            href={m.href}
            title={t(`modules.${m.key}`)}
            desc={t(`modules.${m.key}Desc`)}
          />
        ))}
      </ModuleGrid>

      {/* Tour de primera visita - targets del chrome (tabs +
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
  );
}
