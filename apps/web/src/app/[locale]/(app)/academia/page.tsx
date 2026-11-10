"use client";

import { useEffect } from "react";

import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { useFeatures } from "@/lib/features-context";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyDashboard } from "@/components/academy/academy-dashboard";
import { AcademyTrialEnded } from "@/components/academy/academy-trial-ended";
import { useAcademyAccessState } from "@/components/academy/use-academy-access";
import { visibleHubModules } from "@/lib/academy-modules";
import { academyTrialExpired } from "@/lib/academy-features";
import { ModuleCard, ModuleGrid } from "@/components/console/module-grid";
import { Button, RefreshIcon } from "@/components/ui";

import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";
import { useRouter } from "@/i18n/navigation";

// La lista de módulos y su filtro (cap + feature del tier) vive en
// lib/academy-modules - testeable sin montar la página.

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
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <p className="text-sm text-ink/50">{t("hubDesc")}</p>

      {/* selector: el cambio de academia vive solo en el hub - las
          subrutas heredan la selección persistida. */}
      <AcademyGate selector>
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
  const tc = useTranslations("common");
  // state explícito: "error" muestra retry bajo el resumen (antes el
  // fallo colapsaba a null y staff/instructor veía el hub sin grilla
  // ni aviso - no distinguible de "cargando").
  const { access, state: accessState, reload: reloadAccess } =
    useAcademyAccessState(academy.id);

  // El hub del owner vive en /inicio (AcademyDashboard embebido en
  // HomeHub) - /academia queda como consola para staff/instructor/admin
  // de plataforma, que no tienen el sidebar del owner.
  useEffect(() => {
    if (access?.isOwner === true) router.replace("/inicio");
  }, [access, router]);

  // El owner navega por el sidebar (acordeones por dominio) - la grilla
  // queda para staff/instructor/admin, que no tienen ese drawer y cuyo
  // acceso se filtra por caps + tier. `access === null` (cargando) no
  // pinta la grilla: para el owner un skeleton que colapsa sería flash.
  const showModuleGrid = access !== null && !access.isOwner;

  // Instructor puro (sin staff/admin/owner en la academia): el dashboard
  // de KPIs es staff-gated en la API y quedaría en error permanente.
  const pureInstructor =
    access?.isInstructor === true &&
    !access.isStaff &&
    !access.isAdmin &&
    !access.isOwner;

  // Filtro por cap + feature del tier (spec academy-tier-gates-refine):
  // staff de COBROS no ve cards que solo llevarían a paywall. `flags`
  // gatea además los módulos apagados a nivel plataforma (p.ej.
  // academy_videos OFF - spec academy-videos-flag).
  const { flags } = useFeatures();
  const visible = access
    ? visibleHubModules({
        access,
        academy,
        flags,
        viewerId: me?.id,
        viewerRoles: me?.roles,
        academyOwnerId: academy.ownerId,
      })
    : [];

  // Trial vencido sin suscripción (spec platform-trials §corte): la
  // consola queda en Inicio/Suscripción/Perfil y el inicio muestra el
  // aviso con salida a Suscripción - nada de dashboard ni grilla.
  if (academyTrialExpired(academy)) return <AcademyTrialEnded />;

  // Owner: navegación ya redirigida a /inicio - no se pinta el hub para
  // evitar el flash antes del replace.
  if (access?.isOwner === true) return null;

  return (
    <>
      {/* El dashboard (KPIs/colas del owner) es staff-gated en la API:
          para instructor puro responde 403 y el bloque quedaría en
          error+retry permanente - se omite y la consola queda en la
          grilla de módulos. Mientras /access resuelve (null) tampoco
          se monta: el fetch saldría igual a 403 para instructor. */}
      {access !== null && !pureInstructor && (
        <AcademyDashboard key={academy.id} academy={academy} />
      )}
      {/* Error de /access: la grilla sigue oculta (sin caps no se
          puede filtrar) pero el fallo se avisa con retry - el resumen
          de arriba se conserva porque es fetch aparte. */}
      {accessState === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {tc("error")}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={reloadAccess}
          >
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}
      {showModuleGrid && (
        <div data-tour="academy-modules">
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
        </div>
      )}

      {/* Tour de primera visita - anchors del dashboard + grilla de
          módulos + chrome. Los condicionales (pending/alerts) se omiten
          solos cuando la cola viene vacía. Se monta solo con /access
          resuelto y sin owner: antes el owner alcanzaba a gatillar el
          tour en la ventana previa al redirect a /inicio. */}
      {access !== null && !access.isOwner && (
        <OnboardingRunner
          tour="academia"
          steps={
            [
              {
                element: "[data-tour='academy-kpis']",
                title: tt("s1.title"),
                description: tt("s1.desc"),
                side: "top",
              },
              {
                element: "[data-tour='academy-today']",
                title: tt("s2.title"),
                description: tt("s2.desc"),
                side: "top",
              },
              {
                element: "[data-tour='academy-pending']",
                title: tt("s3.title"),
                description: tt("s3.desc"),
                side: "top",
              },
              {
                element: "[data-tour='academy-alerts']",
                title: tt("s4.title"),
                description: tt("s4.desc"),
                side: "top",
              },
              {
                element: "[data-tour='academy-modules']",
                title: tt("s5.title"),
                description: tt("s5.desc"),
                side: "top",
              },
              {
                // En ≥lg la hamburguesa no existe - el paso del menú
                // apunta a la sidebar (mismo texto, anchor por viewport).
                // Sin drawer ni sidebar (lente instructor) el runner lo
                // omite solo.
                element: "[data-tour='appbar-menu']",
                title: tt("s6.title"),
                description: tt("s6.desc"),
                side: "bottom",
              },
              {
                element: "[data-tour='app-sidebar']",
                title: tt("s6.title"),
                description: tt("s6.desc"),
                side: "right",
              },
              {
                element: "[data-tour='appbar-bell']",
                title: tt("s7.title"),
                description: tt("s7.desc"),
                side: "bottom",
                align: "end",
              },
            ] satisfies TourStep[]
          }
        />
      )}
    </>
  );
}
