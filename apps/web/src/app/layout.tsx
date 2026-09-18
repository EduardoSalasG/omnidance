import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@/i18n/messages";
import baseMessages from "../../messages/es-CL.json";
import { BottomNav } from "@/components/layout/BottomNav";
import { RealtimeProvider } from "@/components/realtime/RealtimeProvider";
import "./globals.css";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

const SITE_DESCRIPTION =
  "Salsa, bachata y cubano en Santiago: socials, eventos, entradas y " +
  "academias de la escena SBK en una sola app. Crea tu cuenta gratis.";
const SITE_TITLE = "Omnidance — la escena SBK de Santiago";

export const metadata: Metadata = {
  metadataBase: new URL(WEB_URL),
  title: {
    default: SITE_TITLE,
    template: "%s — Omnidance",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "salsa Santiago",
    "bachata Santiago",
    "cubano Santiago",
    "social de baile",
    "eventos salsa y bachata",
    "academias de baile Santiago",
    "escena SBK",
    "Omnidance",
  ],
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: "Omnidance",
    url: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // og:image lo genera app/opengraph-image.tsx (Next lo agrega solo).
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  manifest: "/manifest.json",
  // iOS "Añadir a pantalla de inicio": icono dedicado (iOS ignora el
  // manifest) + launch standalone sin chrome de Safari.
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Omnidance",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
  // Sin "cover" los env(safe-area-inset-*) son 0 — la bottom nav se solapa
  // con el home indicator en iOS.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-CL" className="dark">
      <body className="bg-night-950 text-white min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] antialiased">
        <NextIntlClientProvider locale="es-CL" messages={messages}>
          <RealtimeProvider>
            <a
              href="#contenido"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-neon focus:px-4 focus:py-2 focus:font-semibold focus:text-night-950"
            >
              {baseMessages.common.skipToContent}
            </a>
            <div id="contenido" tabIndex={-1} className="outline-none">
              {children}
            </div>
            <BottomNav />
          </RealtimeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
