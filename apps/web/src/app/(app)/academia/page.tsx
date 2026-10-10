"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyDashboard } from "@/components/academy/academy-dashboard";
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
  { href: "/academia/series", key: "series", cap: "schedule" },
  // Particulares sale de la navegación del instructor puro (spec
  // staff-roles) - queda para owner/staff/admin.
  { href: "/academia/particulares", key: "lessons", noInstructor: true },
  { href: "/academia/videos", key: "videos", cap: "schedule" },
  { href: "/academia/cobros", key: "payments", cap: "payments" },
  { href: "/academia/equipo", key: "team", cap: "team" },
  { href: "/academia/configuracion", key: "config", cap: "profile" },
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
      <p className="text-sm text-ink/50">{t("hubDesc")}</p>

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
  const router = useRouter();
  const access = useAcademyAccess(academy.id);

  // El hub del owner vive en /inicio (AcademyDashboard embebido en
  // HomeHub) - /academia queda como consola para staff/instructor/admin
  // de plataforma, que no tienen el sidebar del owner.
  useEffect(() => {
    if (access?.isOwner === true) router.replace("/inicio");
  }, [access, router]);

  // Mientras /access resuelve (null) se muestran los módulos operativos
  // (los del día a día que el gate ya garantiza) - mismo criterio que el
  // filtro owner-only previo: sin skeleton para no causar flash.
  const operational =
    access === null ||
    access.isOwner ||
    access.isAdmin ||
    access.isInstructor ||
    access.isStaff;

  // El owner navega por el sidebar (acordeones por dominio) - la grilla
  // queda para staff/instructor/admin, que no tienen ese drawer y cuyo
  // acceso se filtra por caps. `access === null` (cargando) no pinta la
  // grilla: para el owner un skeleton que colapsa sería flash.
  const showModuleGrid = access !== null && !access.isOwner;

  // Instructor puro (sin staff/admin/owner en la academia): los módulos
  // marcados noInstructor no van en su grilla.
  const pureInstructor =
    access?.isInstructor === true &&
    !access.isStaff &&
    !access.isAdmin &&
    !access.isOwner;

  const visible = MODULES.filter((m) => {
    if ("noInstructor" in m && m.noInstructor && pureInstructor) {
      return false;
    }
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
    return operational;
  });

  // Owner: navegación ya redirigida a /inicio - no se pinta el hub para
  // evitar el flash antes del replace.
  if (access?.isOwner === true) return null;

  return (
    <>
      {/* key por id: cambiar de academia remonta el resumen. */}
      <AcademyDashboard key={academy.id} academy={academy} />
      {showModuleGrid && (
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
      )}

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
              element: "[data-tour='nav-classes']",
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
            {
              // En ≥lg la hamburguesa no existe - el paso de navegación
              // apunta a la sidebar (mismo texto, anchor por viewport).
              element: "[data-tour='app-sidebar']",
              title: tt("s3.title"),
              description: tt("s3.desc"),
              side: "right",
            },
          ] satisfies TourStep[]
        }
      />
    </>
  );
}
