import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

// /academia/configuracion se dividió en sub-páginas (una por sección,
// listadas en la sección Configuración del sidebar). Entrada raíz →
// la primera: General.
export default async function AcademiaConfiguracionRedirect() {
  const locale = await getLocale();
  redirect({ href: "/academia/configuracion/general", locale });
}
