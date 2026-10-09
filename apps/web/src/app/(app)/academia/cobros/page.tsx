"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ClaimsQueue } from "@/components/academy/claims-queue";
import { CobrosExpiring } from "@/components/academy/cobros-expiring";
import { CobrosHistory } from "@/components/academy/cobros-history";
import { CobrosKpiStrip } from "@/components/academy/cobros-kpis";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/cobros - cobros de la academia: KPIs del mes (facturado,
 * ticket, top medios), cola de comprobantes por validar (cada card abre
 * su página de detalle con aprobar/rechazar) e historial unificado de
 * validaciones + pagos por pasarela. Los medios de pago viven en
 * configuración.
 */
export default function AcademiaCobrosPage() {
  const t = useTranslations("academyPay");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/academia" backLabel={t("detailBack")} />
      <AcademyGate>
        {({ academy }) => (
          <>
            <CobrosKpiStrip academyId={academy.id} />
            <CobrosExpiring
              key={`e-${academy.id}`}
              academyId={academy.id}
            />
            <ClaimsQueue key={`q-${academy.id}`} academyId={academy.id} />
            <CobrosHistory key={`h-${academy.id}`} academyId={academy.id} />
          </>
        )}
      </AcademyGate>
    </main>
  );
}
