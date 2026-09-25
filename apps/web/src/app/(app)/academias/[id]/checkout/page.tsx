import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import messages from "../../../../../../messages/es-CL.json";
import membershipCheckoutPart from "@/i18n/parts/membershipCheckout.json";
import { Button } from "@/components/ui";
import { MembershipCheckoutClient } from "./membership-checkout-client";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

// GET /checkout/membership-quote — revisión de orden del plan: precio,
// cargo de servicio, total real, vigencia resultante y suscripción viva
// del viewer a este plan. El paso "review" del checkout de membresía.
export type MembershipQuote = {
  plan: {
    id: string;
    name: string;
    type: string;
    price: number;
    classCount: number | null;
    periodDays: number | null;
    description: string[];
  };
  academy: { id: string; name: string };
  serviceFeeClp: number;
  totalClp: number;
  recurring: boolean;
  vigenciaEndsAt: string | null;
  /** Fin de la vigencia vigente (la compra extiende desde ahí). */
  currentEndsAt: string | null;
  subscription: {
    id: string;
    status: string;
    nextInvoiceAt: string | null;
  } | null;
  gateway: string;
};

async function getQuote(
  planId: string,
): Promise<MembershipQuote | "notfound" | "unavailable" | "error"> {
  const res = await fetch(
    `${API_URL}/api/checkout/membership-quote?planId=${encodeURIComponent(planId)}`,
    {
      cache: "no-store",
      headers: { cookie: cookies().toString() },
    },
  ).catch(() => null);
  if (res?.status === 401) redirect("/login");
  if (res?.status === 404) return "notfound";
  if (res?.status === 400) return "unavailable";
  if (!res || !res.ok) return "error";
  return (await res.json()) as MembershipQuote;
}

export default async function MembershipCheckoutPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { plan?: string; mode?: string };
}) {
  const t = membershipCheckoutPart.membershipCheckout;
  const tc = messages.common;

  if (!searchParams.plan) notFound();
  const quote = await getQuote(searchParams.plan);

  // El plan debe pertenecer a la academia de la URL — deep-link cruzado
  // (otra academia en el path) es 404, no un checkout de otro producto.
  if (quote === "notfound" || quote === "unavailable") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 p-6">
        <p className="text-white/60">
          {quote === "unavailable" ? t.planUnavailable : tc.error}
        </p>
        <Button href={`/academias/${params.id}`} variant="secondary">
          {t.backToAcademy}
        </Button>
      </main>
    );
  }
  if (quote === "error") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 p-6">
        <p className="text-white/60">{tc.error}</p>
        <Button href={`/academias/${params.id}`} variant="secondary">
          {t.backToAcademy}
        </Button>
      </main>
    );
  }
  if (quote.academy.id !== params.id) notFound();

  return (
    <MembershipCheckoutClient
      quote={quote}
      mode={searchParams.mode === "sub" ? "sub" : "once"}
    />
  );
}
