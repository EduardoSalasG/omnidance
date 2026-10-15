import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

// /academia/horarios se eliminó: la parrilla vive dentro de cada clase
// (serie) en /academia/series. Redirect permanente para links viejos.
export default async function AcademiaHorariosPage() {
  const locale = await getLocale();
  redirect({ href: "/academia/series", locale });
}
