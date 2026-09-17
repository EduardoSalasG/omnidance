import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/es-CL.json";
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-CL" className="dark">
      <body className="bg-night-950 text-white min-h-screen antialiased">
        <NextIntlClientProvider locale="es-CL" messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
