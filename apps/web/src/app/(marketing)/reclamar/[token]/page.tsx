import { cookies } from "next/headers";
import { messages } from "@/i18n/messages";
import { Button } from "@/components/ui";
import { ClaimClient } from "./claim-client";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export type ClaimInfo = {
  buyerName: string;
  event: {
    name: string;
    startsAt: string;
    venue: { name: string } | null;
  } | null;
};

async function getClaimInfo(token: string): Promise<ClaimInfo | "gone" | "error"> {
  const res = await fetch(`${API_URL}/api/tickets/claim/${token}`, {
    cache: "no-store",
  }).catch(() => null);
  if (res?.status === 404) return "gone";
  if (!res || !res.ok) return "error";
  return (await res.json()) as ClaimInfo;
}

export default async function ClaimPage({
  params,
}: {
  params: { token: string };
}) {
  const t = messages.claim as Record<string, string>;
  const info = await getClaimInfo(params.token);
  const hasSession = cookies().has("omnidance_session");

  if (info === "gone" || info === "error") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold">
          {info === "gone" ? t.goneTitle : t.errorTitle}
        </h1>
        {info === "gone" && (
          <p className="max-w-sm text-sm text-white/60">{t.goneDesc}</p>
        )}
        <Button href="/" variant="secondary">
          {t.exploreCta}
        </Button>
      </main>
    );
  }

  return (
    <ClaimClient
      token={params.token}
      info={info}
      hasSession={hasSession}
    />
  );
}
