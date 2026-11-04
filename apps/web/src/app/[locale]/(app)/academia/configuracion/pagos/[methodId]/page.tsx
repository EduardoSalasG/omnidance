import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

export default async function ConfigPagosMetodoRedirect({
  params,
}: {
  params: Promise<{ methodId: string }>;
}) {
  const { methodId } = await params;
  const locale = await getLocale();
  redirect({
    href: `/academia/configuracion/metodos-de-pago/${methodId}`,
    locale,
  });
}
