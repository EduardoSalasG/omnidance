import { ChromeShell } from "@/components/layout/ChromeShell";
import { RealtimeProvider } from "@/components/realtime/RealtimeProvider";
import { NavPendingOverlay } from "@/components/ui/nav-pending";
import { ConsentBanner } from "@/components/legal/ConsentBanner";
import { InstallPrompt } from "@/components/install/InstallPrompt";
import { MeProvider } from "@/lib/me-context";
import baseMessages from "../../../messages/es-CL.json";

// Grupo (app): superficies autenticadas con chrome de app - skip-link,
// #contenido y BottomNav dentro del RealtimeProvider. El padding-bottom
// reserva el espacio de la tab bar (safe-area iOS); las páginas de
// (marketing) no lo heredan.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RealtimeProvider>
      <a
        href="#contenido"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-xl focus-visible:bg-neon focus-visible:px-4 focus-visible:py-2 focus-visible:font-semibold focus-visible:text-on-accent"
      >
        {baseMessages.common.skipToContent}
      </a>
      {/* Overlay de navegación: spinner diferido 200ms en cualquier
          link interno lento (toda la app autenticada lo hereda). */}
      <NavPendingOverlay>
        {/* /me compartido: un solo fetch por sesión de (app) - las
            páginas consumen useMe() en vez de refetchear. No bloquea
            children: cada consumidor gatea con `loading`. */}
        <MeProvider>
          <ChromeShell>{children}</ChromeShell>
          {/* Aviso legal no bloqueante (spec legal-consent): visible solo
              cuando /me reporta consentimiento ausente o de versión
              antigua. */}
          <ConsentBanner />
          {/* Invita a instalar la PWA (Chromium: prompt nativo; iOS:
              instrucciones). Dismiss persistente, se oculta si el
              banner de consentimiento ocupa el slot. */}
          <InstallPrompt />
        </MeProvider>
      </NavPendingOverlay>
    </RealtimeProvider>
  );
}
