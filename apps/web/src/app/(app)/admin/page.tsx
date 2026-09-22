"use client";

import { useTranslations } from "next-intl";
import { AdminGate } from "@/components/admin/admin-gate";
import { ModuleCard, ModuleGrid } from "@/components/console/module-grid";

export default function AdminPage() {
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <p className="text-sm text-white/60">{t("hubDesc")}</p>

      <AdminGate>
        <ModuleGrid>
          <ModuleCard
            href="/admin/roles"
            title={t("modules.roles")}
            desc={t("modules.rolesDesc")}
          />
          <ModuleCard
            href="/admin/parametros"
            title={t("modules.params")}
            desc={t("modules.paramsDesc")}
          />
          <ModuleCard
            href="/admin/usuarios"
            title={t("modules.users")}
            desc={t("modules.usersDesc")}
          />
          <ModuleCard
            href="/admin/datos"
            title={t("modules.datos")}
            desc={t("modules.datosDesc")}
          />
          <ModuleCard
            href="/admin/auditoria"
            title={t("modules.audit")}
            desc={t("modules.auditDesc")}
          />
          <ModuleCard
            href="/admin/catalogos"
            title={t("modules.catalogs")}
            desc={t("modules.catalogsDesc")}
          />
          <ModuleCard
            href="/analitica/usuarios"
            title={t("modules.analyticsUser")}
            desc={t("modules.analyticsUserDesc")}
          />
        </ModuleGrid>
      </AdminGate>
    </main>
  );
}
