import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getMessages, getLocale } from "next-intl/server";

import { Button } from "@/components/ui";
import { MembershipCheckoutClient } from "./membership-checkout-client";
import { serverApiUrl } from "@/lib/server-api";
import { redirect } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

// GET /checkout/membership-quote - revisión de orden del plan: precio,
// total real, vigencia resultante y suscripción viva del viewer a este
// plan. El paso "review" del checkout de membresía.
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
  const API_URL = await serverApiUrl();
  const res = await fetch(
    `${API_URL}/api/checkout/membership-quote?planId=${encodeURIComponent(planId)}`,
    {
      cache: "no-store",
      headers: { cookie: (await cookies()).toString() },
    },
  ).catch(() => null);
  if (res?.status === 401) {
    redirect({ href: "/login", locale: await getLocale() });
  }
  if (res?.status === 404) return "notfound";
  if (res?.status === 400) return "unavailable";
  if (!res || !res.ok) return "error";
  return (await res.json()) as MembershipQuote;
}

export default async function MembershipCheckoutPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ plan?: string; mode?: string }>;
  }
) {
  const locale = await getLocale();
  const searchParams = await props.searchParams;
  const params = await props.params;
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  const t = m.membershipCheckout;
  const tc = m.common;

  if (!searchParams.plan) notFound();
  const quote = await getQuote(searchParams.plan);

  // El plan debe pertenecer a la academia de la URL - deep-link cruzado
  // (otra academia en el path) es 404, no un checkout de otro producto.
  if (quote === "notfound" || quote === "unavailable") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 p-6">
        <p className="text-ink/60">
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
        <p className="text-ink/60">{tc.error}</p>
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
