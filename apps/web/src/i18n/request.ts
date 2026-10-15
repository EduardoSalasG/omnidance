import { getRequestConfig } from "next-intl/server";
import { getMessages } from "./messages";
import { routing, type Locale } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale lo resuelve el middleware de next-intl (prefijo,
  // cookie o Accept-Language). Cualquier valor desconocido cae al
  // default - nunca renderizamos con un locale no soportado.
  const requested = await requestLocale;
  const locale: Locale = routing.locales.includes(requested as Locale)
    ? (requested as Locale)
    : routing.defaultLocale;
  return { locale, messages: getMessages(locale) };
});
