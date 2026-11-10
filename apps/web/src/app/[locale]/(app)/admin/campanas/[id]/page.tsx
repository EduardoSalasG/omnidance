import { AdminGate } from "@/components/admin/admin-gate";
import { CampaignDetail } from "./campaign-detail";

/**
 * Ficha de campaña (change admin-campaign-detail): detalle + historial
 * de corridas + acciones. Page server que resuelve `id` y delega al
 * client component (patrón i/[inviteId]: use(params) suspende en
 * tests aunque la Promise esté resuelta).
 */
export default async function AdminCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <AdminGate>
        <CampaignDetail id={id} />
      </AdminGate>
    </main>
  );
}
