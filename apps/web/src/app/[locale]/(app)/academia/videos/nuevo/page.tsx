"use client";

import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyTierGate } from "@/components/academy/academy-tier-gate";
import { VideoForm } from "@/components/academy/video-form";
import { ConsoleHeader } from "@/components/console/console-header";
import { useMessages } from "next-intl";



/**
 * /academia/videos/nuevo - alta de video (link externo) de la academia
 * seleccionada. El form gatea con canAdminister (owner/ADMIN), igual
 * que el POST /academies/:id/videos del backend.
 */
type AcademyExtras = (typeof import("@/i18n/parts/academyExtras.json"))["academyExtras"];

export default function AcademiaNuevoVideoPage() {
  const t = (useMessages() as { academyExtras: { videos: Record<string,string> } }).academyExtras.videos;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader backHref="/academia/videos" backLabel={t.title} />
      <AcademyGate>
        {({ academy }) => (
          <AcademyTierGate academy={academy} feature="videos">
            <VideoForm key={academy.id} academy={academy} />
          </AcademyTierGate>
        )}
      </AcademyGate>
    </main>
  );
}
