import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getMessages, getLocale } from "next-intl/server";

import { Button } from "@/components/ui";
import { PrivateCheckoutClient } from "./private-checkout-client";
import { serverApiUrl } from "@/lib/server-api";
import { redirect } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

// GET /checkout/private-class-quote: revisión de orden de la clase
// particular (spec private-class-checkout). Precio único de la
// academia (privateLessonPrice; modelo SaaS sin cargo al comprador).
// El paso "review" del checkout, igual que membership-quote. La
// particular no declara moneda en la entidad: la orden es CLP.
export type PrivateClassQuote = {
  listPrice: number;
  discount: number;
  total: number;
  academy: { id: string; name: string };
  gateway: string;
};

async function getQuote(
  academyId: string,
): Promise<PrivateClassQuote | "error"> {
  const API_URL = await serverApiUrl();
  const res = await fetch(
    `${API_URL}/api/checkout/private-class-quote?academyId=${encodeURIComponent(academyId)}`,
    {
      cache: "no-store",
      headers: { cookie: (await cookies()).toString() },
    },
  ).catch(() => null);
  if (res?.status === 401) {
    redirect({ href: "/login", locale: await getLocale() });
  }
  // 404 academia inexistente y 400 no vende particulares / bloqueada
  // por mora: no hay orden que revisar, la ruta queda not-found.
  if (res?.status === 404 || res?.status === 400) notFound();
  if (!res || !res.ok) return "error";
  return (await res.json()) as PrivateClassQuote;
}

export default async function PrivateClassCheckoutPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  const t = m.membershipCheckout;
  const tc = m.common;

  const quote = await getQuote(params.id);
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
  // La quote responde la academia pedida: un id cruzado en el path
  // es 404, no el checkout de otro producto.
  if (quote.academy.id !== params.id) notFound();

  return <PrivateCheckoutClient quote={quote} />;
}
