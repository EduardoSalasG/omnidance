import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

// /academia/asistencia se eliminó: la asistencia se consulta en el
// detalle de cada clase y marcarla es del instructor desde su clase.
export default async function AcademiaAsistenciaPage() {
  const locale = await getLocale();
  redirect({ href: "/academia/series", locale });
}
