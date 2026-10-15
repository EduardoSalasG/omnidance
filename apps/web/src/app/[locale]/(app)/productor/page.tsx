import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

/**
 * /productor - el hub se eliminó (spec events/producer-console): el
 * home del productor es su dashboard en /inicio y cada módulo vive en
 * el drawer/sidebar. La ruta queda como redirect para no romper links
 * viejos (tours, mails, el retorno `?pro=ok` ahora va a
 * /productor/parametros).
 */
export default async function ProducerPage() {
  const locale = await getLocale();
  redirect({ href: "/inicio", locale });
}
