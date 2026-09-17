import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/es-CL.json";
import { BottomNav } from "@/components/layout/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Omnidance",
  description: "La plataforma de la escena SBK — nightlife y academias",
  manifest: "/manifest.json",
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
      <body className="bg-night-950 text-white min-h-screen pb-[calc(4rem+env(safe-area-inset-bottom))] antialiased">
        <NextIntlClientProvider locale="es-CL" messages={messages}>
          <a
            href="#contenido"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-neon focus:px-4 focus:py-2 focus:font-semibold focus:text-night-950"
          >
            {messages.common.skipToContent}
          </a>
          <div id="contenido" tabIndex={-1} className="outline-none">
            {children}
          </div>
          <BottomNav />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
