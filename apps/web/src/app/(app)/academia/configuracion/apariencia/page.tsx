"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

/**
 * /academia/configuracion/apariencia - tema claro/oscuro/sistema para la
 * lente de dueño de academia (persiste por dispositivo, lib/theme). En
 * lentes de consola la apariencia vive en configuración, no en /perfil.
 * Página raíz de la sección - sin back.
 */
export default function ConfigAparienciaPage() {
  const t = useTranslations("profile");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-4xl lg:px-8">
      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("appearance")}
        </h2>
        <div className="mt-3">
          <ThemeToggle />
        </div>
      </Card>
    </main>
  );
}
