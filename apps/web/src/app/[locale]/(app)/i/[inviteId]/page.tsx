import { InviteBridge } from "./invite-bridge";

/**
 * Bridge del push de dispositivo `academy.invite` (spec
 * academies/student-invites): el service worker abre `data.url =
 * /i/:inviteId` y esta ruta resuelve el inviteId para el client
 * component que consume + redirige.
 */
export default async function InviteBridgePage({
  params,
}: {
  params: Promise<{ inviteId: string }>;
}) {
  const { inviteId } = await params;
  return <InviteBridge inviteId={inviteId} />;
}
