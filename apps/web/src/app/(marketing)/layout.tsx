import { NextIntlClientProvider } from "next-intl";
import { marketingMessages } from "@/i18n/messages";

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
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextIntlClientProvider locale="es-CL" messages={marketingMessages}>
      <div className="force-dark min-h-dvh">{children}</div>
    </NextIntlClientProvider>
  );
}
