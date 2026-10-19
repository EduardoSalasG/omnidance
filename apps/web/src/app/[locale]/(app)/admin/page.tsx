import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

/**
 * /admin - el hub de módulos se eliminó (spec admin-console-billing-nav):
 * el home del admin es su dashboard en /inicio y cada módulo vive en el
 * drawer/sidebar. La ruta queda como redirect para no romper links viejos
 * (mails, history, /admin/* sigue siendo el prefijo de la consola).
 */
export default async function AdminPage() {
  const locale = await getLocale();
  redirect({ href: "/inicio", locale });
}
