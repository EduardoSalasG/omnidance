import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@/i18n/messages";
import { PageLoadingHost } from "@/components/ui/page-loading-host";
import { SITE_URL } from "@/lib/site-url";
import "./globals.css";

const SITE_DESCRIPTION =
  "Sociales, entradas, academias y clases de la comunidad salsera, " +
  "timbera y bachatera de Chile en una sola app. Registro rápido y fácil.";
const SITE_TITLE = "Omnidance - salsa, timba y bachata en Chile";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | Omnidance",
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
  // Sigue al tema del SO (el meta no puede leer la preferencia del
  // usuario - el override por toggle solo afecta el chrome interno).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
  ],
  width: "device-width",
  initialScale: 1,
  // Sin "cover" los env(safe-area-inset-*) son 0 - la bottom nav se solapa
  // con el home indicator en iOS.
  viewportFit: "cover",
};

// Aplica la preferencia de tema ANTES del primer paint (sin FOUC):
// localStorage gana; "system"/ausente sigue prefers-color-scheme.
// Corre síncrono en <head>; el estado vivo lo mantiene lib/theme.ts.
const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("omnidance:theme");var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.classList.toggle("light",!d);e.dataset.theme=d?"dark":"light";}catch(_){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: la clase dark/light la ajusta el script
    // inline según preferencia - React no debe reconciliarla.
    <html
      lang="es-CL"
      className="dark scroll-smooth motion-reduce:scroll-auto"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="bg-canvas text-ink min-h-dvh antialiased">
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
