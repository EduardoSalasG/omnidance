import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

// /academia/asistencia se eliminó: la asistencia se consulta en el
// detalle de cada clase y marcarla es del instructor desde su clase.
// El redirect va al hub /academia (resuelve por lente) - /series es
// superficie owner y dejaría al instructor en un 403.
export default async function AcademiaAsistenciaPage() {
  const locale = await getLocale();
  redirect({ href: "/academia", locale });
}
