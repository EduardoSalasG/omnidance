"use client";

import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademySettings } from "@/components/academy/academy-settings";

/**
 * /academia/configuracion/general - "Valores por defecto" de las clases
 * de la academia (quórum por defecto, precio de clase particular).
 * Página raíz de la sección Configuración del drawer - sin back
 * (nivel 1).
 */
export default function ConfigGeneralPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-4xl lg:px-8">
      <AcademyGate>
        {({ academy }) => (
          <AcademySettings key={academy.id} academy={academy} />
        )}
      </AcademyGate>
    </main>
  );
}
