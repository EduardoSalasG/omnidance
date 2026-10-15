import { NextIntlClientProvider } from "next-intl";
import { marketingMessages } from "@/i18n/messages";
import { routing, type Locale } from "@/i18n/routing";

// Grupo (marketing): superficies públicas sin chrome de app.
// Sin BottomNav, sin RealtimeProvider, sin padding de tab bar -
// eso vive en (app)/layout.tsx.
//
// Provider propio con SOLO los namespaces de sus client components
// (login-form, claim-client): la pública no serializa el catálogo
// completo de la app en cada page load (~15KB vs ~190KB).
//
// .force-dark: las públicas son siempre oscuras (identidad de marca
// nocturna, landings de locales/fiesta). El marcador activa el override
// de tokens en globals.css (html:has) sin importar la preferencia de
// tema del usuario ni el toggle de /perfil.
export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc = (
    routing.locales.includes(locale as Locale) ? locale : routing.defaultLocale
  ) as Locale;
  return (
    <NextIntlClientProvider locale={loc} messages={marketingMessages(loc)}>
      <div className="force-dark min-h-dvh">{children}</div>
    </NextIntlClientProvider>
  );
}
