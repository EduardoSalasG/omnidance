"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  PriceTag,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";

type DiscountCodeDetail = {
  id: string;
  code: string;
  type: string;
  eventId: string | null;
  seriesId: string | null;
  percentOff: number | null;
  amountOff: number | null;
  usedCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  createdAt: string;
};

type Redemption = {
  id: string;
  personId: string;
  paymentId: string | null;
  redeemedAt: string;
  person: { personId: string; name: string };
};

const dayFmt = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * /productor/codigos/[id] - ficha del código de descuento: datos del
 * código + redemptions auditables (persona + orden). El código no se
 * edita - un cambio de condiciones es un código nuevo (auditoría limpia).
 */
function CodeDetail() {
  const t = useTranslations("producer");
  const tc = useTranslations("common");
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [code, setCode] = useState<DiscountCodeDetail | null>(null);
  const [redemptions, setRedemptions] = useState<Redemption[] | null>(null);
  const [eventName, setEventName] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    const res = await apiFetch(`/discount-codes/${id}`).catch(() => null);
    if (!res?.ok) {
      setLoadState("error");
      return;
    }
    const detail = (await res.json()) as DiscountCodeDetail;
    setCode(detail);
    const red = await apiFetch(`/discount-codes/${id}/redemptions`).catch(
      () => null,
    );
    setRedemptions(red?.ok ? ((await red.json()) as Redemption[]) : []);
    setLoadState("ready");
    if (detail.eventId) {
      const ev = await apiFetch(`/events/${detail.eventId}`).catch(() => null);
      if (ev?.ok) {
        setEventName(((await ev.json()) as { name?: string }).name ?? null);
      }
    }
  }, [id]);

  useEffect(() => {
    setLoadState("loading");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, nonce]);

  const expired =
    code?.expiresAt != null && new Date(code.expiresAt) <= new Date();

  return (
    <>
      <ConsoleHeader
        backHref="/productor/codigos"
        backLabel={t("discountCodes")}
      />

      {loadState === "loading" && <SkeletonList items={2} />}

      {loadState === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {tc("error")}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setNonce((n) => n + 1)}
          >
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {loadState === "ready" && code && (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-xl font-bold tracking-wide">
                {code.code}
              </h2>
              <Badge variant="neon">
                {t.has(`types.${code.type}`) ? t(`types.${code.type}`) : code.type}
              </Badge>
              {expired && (
                <Badge variant="muted">{t("codeDetail.expired")}</Badge>
              )}
            </div>
            <Card className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-ink/50">{t("percentOff")}</dt>
                  <dd className="font-semibold">
                    {code.percentOff !== null ? `−${code.percentOff}%` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">{t("amountOff")}</dt>
                  <dd className="font-semibold">
                    {code.amountOff !== null ? (
                      <PriceTag amount={code.amountOff} />
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">{t("usedCount")}</dt>
                  <dd className="tabular-nums">
                    {code.usedCount}
                    {code.maxUses !== null ? ` / ${code.maxUses}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">{t("expiresAt")}</dt>
                  <dd className="tabular-nums">
                    {code.expiresAt
                      ? dayFmt.format(new Date(code.expiresAt))
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">
                    {t("codeDetail.createdAt")}
                  </dt>
                  <dd className="tabular-nums text-ink/70">
                    {dayFmt.format(new Date(code.createdAt))}
                  </dd>
                </div>
                {code.eventId && (
                  <div>
                    <dt className="text-xs text-ink/50">{t("event")}</dt>
                    <dd>
                      <Link
                        href={`/productor/eventos/${code.eventId}`}
                        className="text-neon underline-offset-4 hover:underline"
                      >
                        {eventName ?? code.eventId}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
                {t("codeDetail.redemptions")}
              </h2>
              <p className="mt-1 text-xs text-ink/50">
                {t("codeDetail.redemptionsDesc")}
              </p>
            </div>
            {redemptions !== null && redemptions.length === 0 && (
              <p role="status" className="text-sm text-ink/60">
                {t("codeDetail.emptyRedemptions")}
              </p>
            )}
            {redemptions !== null && redemptions.length > 0 && (
              <Card padded={false}>
                <ul className="flex flex-col divide-y divide-line">
                  {redemptions.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {r.person.name}
                      </span>
                      <span className="tabular-nums text-ink/60">
                        {dateTimeFmt.format(new Date(r.redeemedAt))}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export default function CodeDetailPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-3xl lg:px-8">
      <ProducerGate>
        <CodeDetail />
      </ProducerGate>
    </main>
  );
}
