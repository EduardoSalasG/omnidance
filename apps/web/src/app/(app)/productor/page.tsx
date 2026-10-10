import { redirect } from "next/navigation";

/**
 * /productor - el hub se eliminó (spec events/producer-console): el
 * home del productor es su dashboard en /inicio y cada módulo vive en
 * el drawer/sidebar. La ruta queda como redirect para no romper links
 * viejos (tours, mails, el retorno `?pro=ok` ahora va a
 * /productor/parametros).
 */
export default function ProducerPage() {
  redirect("/inicio");
}
