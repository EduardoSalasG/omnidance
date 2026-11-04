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
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("appearance")}
        </h2>
        {/* lg: el control segmentado no se estira al ancho completo de
            la card: 3 opciones a ~1100px se leen como franja vacía. */}
        <div className="mt-3 lg:max-w-md">
          <ThemeToggle />
        </div>
      </Card>
    </main>
  );
}
