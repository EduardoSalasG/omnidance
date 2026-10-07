// Grupo (marketing): superficies públicas sin chrome de app.
// Sin BottomNav, sin RealtimeProvider, sin padding de tab bar -
// eso vive en (app)/layout.tsx.
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
  return <div className="force-dark min-h-dvh">{children}</div>;
}
