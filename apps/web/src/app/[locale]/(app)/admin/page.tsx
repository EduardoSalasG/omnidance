"use client";

import { useTranslations } from "next-intl";
import { AdminGate } from "@/components/admin/admin-gate";
import { ModuleCard, ModuleGrid } from "@/components/console/module-grid";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";

export default function AdminPage() {
  const t = useTranslations("admin");
  const tt = useTranslations("tours.admin");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <p className="text-sm text-ink/60">{t("hubDesc")}</p>

      <AdminGate>
        <ModuleGrid>
          <ModuleCard
            href="/admin/roles"
            title={t("modules.roles")}
            desc={t("modules.rolesDesc")}
            dataTour="admin-roles"
          />
          <ModuleCard
            href="/admin/parametros"
            title={t("modules.params")}
            desc={t("modules.paramsDesc")}
            dataTour="admin-params"
          />
          <ModuleCard
            href="/admin/usuarios"
            title={t("modules.users")}
            desc={t("modules.usersDesc")}
            dataTour="admin-users"
          />
          <ModuleCard
            href="/admin/datos"
            title={t("modules.datos")}
            desc={t("modules.datosDesc")}
          />
          <ModuleCard
            href="/admin/finanzas"
            title={t("modules.finanzas")}
            desc={t("modules.finanzasDesc")}
          />
          <ModuleCard
            href="/admin/facturacion"
            title={t("modules.facturacion")}
            desc={t("modules.facturacionDesc")}
          />
          <ModuleCard
            href="/admin/jobs"
            title={t("modules.jobs")}
            desc={t("modules.jobsDesc")}
            dataTour="admin-jobs"
          />
          <ModuleCard
            href="/admin/campanas"
            title={t("modules.campaigns")}
            desc={t("modules.campaignsDesc")}
          />
          <ModuleCard
            href="/admin/auditoria"
            title={t("modules.audit")}
            desc={t("modules.auditDesc")}
          />
          <ModuleCard
            href="/admin/academias"
            title={t("modules.academias")}
            desc={t("modules.academiasDesc")}
          />
          <ModuleCard
            href="/admin/catalogos"
            title={t("modules.catalogs")}
            desc={t("modules.catalogsDesc")}
            dataTour="admin-catalogs"
          />
        </ModuleGrid>

        {/* Tour de primera visita - la consola principal; los módulos
            sin anchor (datos, finanzas, auditoría…) se nombran en el
            paso del menú, no uno por uno. */}
        <OnboardingRunner
          tour="admin"
          steps={
            [
              {
                element: "[data-tour='admin-users']",
                title: tt("s1.title"),
                description: tt("s1.desc"),
                side: "bottom",
              },
              {
                element: "[data-tour='admin-roles']",
                title: tt("s2.title"),
                description: tt("s2.desc"),
                side: "bottom",
              },
              {
                element: "[data-tour='admin-params']",
                title: tt("s3.title"),
                description: tt("s3.desc"),
                side: "top",
              },
              {
                element: "[data-tour='admin-jobs']",
                title: tt("s4.title"),
                description: tt("s4.desc"),
                side: "top",
              },
              {
                element: "[data-tour='admin-catalogs']",
                title: tt("s5.title"),
                description: tt("s5.desc"),
                side: "top",
              },
              {
                // En ≥lg la hamburguesa no existe - el anchor cae a la
                // sidebar (mismo texto, dos anchors).
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
            ] satisfies TourStep[]
          }
        />
      </AdminGate>
    </main>
  );
}
