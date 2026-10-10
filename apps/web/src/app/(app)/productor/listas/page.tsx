import { redirect } from "next/navigation";

/**
 * /productor/listas - las listas de invitados viven dentro de la ficha
 * del evento (spec events/producer-console); esta ruta queda como
 * compat hacia el listado de eventos.
 */
export default function ProducerListsPage() {
  redirect("/productor/eventos");
}
