"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { Videos } from "@/components/academy/videos";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/videos — material por clase (links externos) de la academia
 * seleccionada, con control de acceso por asistencia/enrollment.
 */
export default function AcademiaVideosPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader
        backHref="/academia"
        backLabel={t("title")}
        title={t("modules.videos")}
      />
      <AcademyGate>
        {({ academy }) => <Videos key={academy.id} academy={academy} />}
      </AcademyGate>
    </main>
  );
}
