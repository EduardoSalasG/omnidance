"use client";

import { AcademyGate } from "@/components/academy/academy-gate";
import { VideoForm } from "@/components/academy/video-form";
import { ConsoleHeader } from "@/components/console/console-header";
import academyExtras from "@/i18n/parts/academyExtras.json";

const t = academyExtras.academyExtras.videos;

/**
 * /academia/videos/nuevo - alta de video (link externo) de la academia
 * seleccionada. El form gatea con canAdminister (owner/ADMIN), igual
 * que el POST /academies/:id/videos del backend.
 */
export default function AcademiaNuevoVideoPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader backHref="/academia/videos" backLabel={t.title} />
      <AcademyGate>
        {({ academy }) => <VideoForm key={academy.id} academy={academy} />}
      </AcademyGate>
    </main>
  );
}
