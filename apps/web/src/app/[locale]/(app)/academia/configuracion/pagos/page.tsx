import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

// Los medios de pago se renombraron para que la URL matchee su título
// ("Métodos de pago"). Redirect de deep-links viejos.
export default async function ConfigPagosRedirect() {
  const locale = await getLocale();
  redirect({ href: "/academia/configuracion/metodos-de-pago", locale });
}
