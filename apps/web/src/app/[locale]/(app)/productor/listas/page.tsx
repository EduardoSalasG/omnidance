import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

/**
 * /productor/listas - las listas de invitados viven dentro de la ficha
 * del evento (spec events/producer-console); esta ruta queda como
 * compat hacia el listado de eventos.
 */
export default async function ProducerListsPage() {
  const locale = await getLocale();
  redirect({ href: "/productor/eventos", locale });
}
