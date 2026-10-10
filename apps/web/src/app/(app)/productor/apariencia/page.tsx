"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

/**
 * /productor/apariencia - tema de la consola (claro/oscuro/sistema por
 * dispositivo). En lentes de gestión vive en Configuración, no en
 * /perfil (misma convención que la academia).
 */
export default function ProducerAparienciaPage() {
  const tn = useTranslations("nav");
  const tprf = useTranslations("profile");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-4xl lg:px-8">
      <ConsoleHeader backHref="/inicio" backLabel={tn("home")} />
      <ProducerGate>
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
            {tprf("appearance")}
          </h2>
          <div className="mt-3">
            <ThemeToggle />
          </div>
        </Card>
      </ProducerGate>
    </main>
  );
}
