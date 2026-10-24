"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ClaimsQueue } from "@/components/academy/claims-queue";
import { CobrosExpiring } from "@/components/academy/cobros-expiring";
import { CobrosHistory } from "@/components/academy/cobros-history";
import { CobrosKpiStrip } from "@/components/academy/cobros-kpis";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";

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
      <ConsoleHeader
        backHref="/academia"
        backLabel={t("detailBack")}
        actions={
          // Reporte de cobranza por período (spec academy-tier-v2) -
          // el libro filtrable con agregados; mismo gate que el módulo.
          <Button href="/academia/cobros/reporte" variant="secondary" size="sm">
            {t("report.link")}
          </Button>
        }
      />
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
            {/* Tour de primera visita del módulo - las colas vacías se
                omiten solas (sus anchors no existen en el DOM). */}
            <CobrosTour />
          </>
        )}
      </AcademyGate>
    </main>
  );
}

function CobrosTour() {
  const tt = useTranslations("tours.academia-cobros");
  return (
    <OnboardingRunner
      tour="academia-cobros"
      steps={
        [
          {
            element: "[data-tour='academy-cobros-kpis']",
            title: tt("s1.title"),
            description: tt("s1.desc"),
            side: "top",
          },
          {
            element: "[data-tour='academy-cobros-expiring']",
            title: tt("s2.title"),
            description: tt("s2.desc"),
            side: "top",
          },
          {
            element: "[data-tour='academy-cobros-queue']",
            title: tt("s3.title"),
            description: tt("s3.desc"),
            side: "top",
          },
          {
            element: "[data-tour='academy-cobros-history']",
            title: tt("s4.title"),
            description: tt("s4.desc"),
            side: "top",
          },
        ] satisfies TourStep[]
      }
    />
  );
}
