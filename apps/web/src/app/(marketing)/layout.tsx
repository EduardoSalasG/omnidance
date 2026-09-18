// Grupo (marketing): superficies públicas sin chrome de app.
// Sin BottomNav, sin RealtimeProvider, sin padding de tab bar —
// eso vive en (app)/layout.tsx.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
