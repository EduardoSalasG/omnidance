import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

// El mantenedor de la línea de niveles es configuración de la
// academia: vive en la sección Configuración del drawer (spec
// academies/class-levels). Redirect para deep-links de la ruta vieja.
export default async function AcademiaNivelesRedirect() {
  const locale = await getLocale();
  redirect({ href: "/academia/configuracion/niveles", locale });
}
