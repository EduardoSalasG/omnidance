import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

// La suscripción de la academia vive en la sección Configuración del
// drawer como el resto de sus páginas. Redirect de deep-links viejos.
export default async function AcademiaSuscripcionRedirect() {
  const locale = await getLocale();
  redirect({ href: "/academia/configuracion/suscripcion", locale });
}
