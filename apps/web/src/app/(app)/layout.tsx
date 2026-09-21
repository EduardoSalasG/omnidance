import { ChromeShell } from "@/components/layout/ChromeShell";
import { RealtimeProvider } from "@/components/realtime/RealtimeProvider";
import { NavPendingOverlay } from "@/components/ui/nav-pending";
import baseMessages from "../../../messages/es-CL.json";

// Grupo (app): superficies autenticadas con chrome de app — skip-link,
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
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-neon focus:px-4 focus:py-2 focus:font-semibold focus:text-night-950"
      >
        {baseMessages.common.skipToContent}
      </a>
      {/* Overlay de navegación: spinner diferido 200ms en cualquier
          link interno lento (toda la app autenticada lo hereda). */}
      <NavPendingOverlay>
        <ChromeShell>{children}</ChromeShell>
      </NavPendingOverlay>
    </RealtimeProvider>
  );
}
