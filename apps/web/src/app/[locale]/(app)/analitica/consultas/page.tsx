import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

// La consola de consultas se consolidó en /analitica (única superficie
// de analítica por lente activa). Link viejo → redirect.
export default async function ConsultasRedirect() {
  const locale = await getLocale();
  redirect({ href: "/analitica", locale });
}
