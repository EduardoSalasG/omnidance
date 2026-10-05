"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyPayments } from "@/components/academy/academy-payments";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/cobros — cobros de membresías de la academia seleccionada
 * (GET /payments/by-academy/:id). El gate resuelve auth + academia; el
 * endpoint limita a owner/admin (403 → mensaje "sin acceso" adentro).
 */
export default function AcademiaCobrosPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <AcademyPayments key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}
