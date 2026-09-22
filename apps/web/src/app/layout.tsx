import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@/i18n/messages";
import { PageLoadingHost } from "@/components/ui/page-loading-host";
import "./globals.css";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

const SITE_DESCRIPTION =
  "Sociales, entradas, academias y clases de la comunidad salsera, " +
  "timbera y bachatera de Chile en una sola app. Registro rápido y fácil.";
const SITE_TITLE = "Omnidance — salsa, timba y bachata en Chile";

export const metadata: Metadata = {
  metadataBase: new URL(WEB_URL),
  title: {
    default: SITE_TITLE,
    template: "%s — Omnidance",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "salsa Chile",
    "timba Chile",
    "bachata Chile",
    "social de baile",
    "eventos salsa y bachata",
    "academias de baile Chile",
    "clases de salsa",
    "clases de bachata",
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
    <html lang="es-CL" className="dark scroll-smooth motion-reduce:scroll-auto">
      <body className="bg-night-950 text-white min-h-dvh antialiased">
        <NextIntlClientProvider locale="es-CL" messages={messages}>
          {children}
          {/* Host del beacon de carga: spinner único para navegación
              (NavPendingOverlay) y cargas de página (PageLoading). */}
          <PageLoadingHost />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
