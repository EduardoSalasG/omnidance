import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

export default async function ConfigPagosNuevoRedirect() {
  const locale = await getLocale();
  redirect({ href: "/academia/configuracion/metodos-de-pago/nuevo", locale });
}
