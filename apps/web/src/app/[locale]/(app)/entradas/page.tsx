import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

// "Mis entradas" se fusionó con la vista mios de /eventos - una sola
// superficie para ver y gestionar tickets. Links antiguos (checkout,
// retorno de pago, QR) aterrizan en la vista fusionada.
export default async function EntradasPage() {
  const locale = await getLocale();
  redirect({ href: "/eventos?view=mios", locale });
}
