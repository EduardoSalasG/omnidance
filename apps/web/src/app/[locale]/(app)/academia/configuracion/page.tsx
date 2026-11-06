import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

// /academia/configuracion se dividió en sub-páginas (una por sección,
// listadas en la sección Configuración del sidebar). Entrada raíz →
// perfil: el único destino disponible en TODOS los tiers (clases es
// feature STUDIO y en COBROS la raíz caería en paywall - spec
// academy-tier-gates-refine).
export default async function AcademiaConfiguracionRedirect() {
  const locale = await getLocale();
  redirect({ href: "/academia/configuracion/perfil", locale });
}
