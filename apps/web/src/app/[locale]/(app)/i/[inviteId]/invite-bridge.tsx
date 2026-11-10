"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { setViewMode } from "@/lib/view-mode";
import { PageLoading } from "@/components/ui";

/**
 * Consume la invitación del push de dispositivo (channel=device),
 * persiste la lente academy y reemplaza hacia la ficha pública. Ante
 * 404 (invite ajena/inexistente) o 401 (sin sesión) cae al centro de
 * notificaciones - el correo con magic link sigue siendo el camino de
 * entrada sin sesión.
 */
export function InviteBridge({ inviteId }: { inviteId: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          `/academies/invites/${inviteId}/consume`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel: "device" }),
          },
        );
        const json: unknown = res.ok ? await res.json() : null;
        const academyId =
          json && typeof json === "object" && "academyId" in json
            ? (json as { academyId?: unknown }).academyId
            : null;
        if (cancelled) return;
        if (typeof academyId === "string" && academyId) {
          setViewMode("academy");
          router.replace(`/academias/${academyId}`);
        } else {
          router.replace("/notificaciones");
        }
      } catch {
        if (!cancelled) router.replace("/notificaciones");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteId, router]);

  return <PageLoading />;
}
