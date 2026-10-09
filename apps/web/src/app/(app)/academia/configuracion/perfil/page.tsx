"use client";

import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyProfile } from "@/components/academy/academy-profile";

/**
 * /academia/configuracion/perfil - perfil público de la academia (lo que
 * ven los bailarines en la ficha y el mapa). Página raíz de la sección
 * Configuración - sin back.
 */
export default function ConfigPerfilPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-4xl lg:px-8">
      <AcademyGate>
        {({ academy }) => (
          <AcademyProfile key={academy.id} academy={academy} />
        )}
      </AcademyGate>
    </main>
  );
}
