import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

// La página de valores por defecto de clases se renombró para que la
// URL matchee su título ("Clases"). Redirect de deep-links viejos.
export default async function ConfigGeneralRedirect() {
  const locale = await getLocale();
  redirect({ href: "/academia/configuracion/clases", locale });
}
