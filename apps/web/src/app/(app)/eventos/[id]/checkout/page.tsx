import { notFound } from "next/navigation";
import messages from "../../../../../../messages/es-CL.json";
import { Button } from "@/components/ui";
import { CheckoutClient } from "./checkout-client";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export type CheckoutEvent = {
  id: string;
  name: string;
  startsAt: string;
  status: string;
  presalePrice: number | null;
  doorPrice: number | null;
  venue: { name: string; address: string | null };
  series: { name: string } | null;
};

async function getEvent(id: string): Promise<CheckoutEvent | "error"> {
  const res = await fetch(`${API_URL}/api/events/${id}`, {
    cache: "no-store",
  }).catch(() => null);
  if (res?.status === 404) notFound();
  if (!res || !res.ok) return "error";
  return (await res.json()) as CheckoutEvent;
}

export default async function CheckoutPage({
  params,
}: {
  params: { id: string };
}) {
  const t = messages.events;
  const event = await getEvent(params.id);

  if (event === "error") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 p-6">
        <p className="text-white/60">{t.loadError}</p>
        <Button href={`/eventos/${params.id}`} variant="secondary">
          {t.backToList}
        </Button>
      </main>
    );
  }

  return <CheckoutClient event={event} />;
}
