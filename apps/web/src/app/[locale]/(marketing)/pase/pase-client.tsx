"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { useDateFmt } from "@/lib/intl";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  PriceTag,
  SkeletonList,
  Spinner,
} from "@/components/ui";

type SocialPass = {
  status: string | null;
  amount: number | null;
  currency: string | null;
  creditsBalance: number;
  creditsPerPeriod: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  price: { amount: number; currency: string };
};

export function PaseClient() {
  const t = useTranslations("pase");
  const dateFmt = useDateFmt({ day: "numeric", month: "long", year: "numeric" });
  const params = useSearchParams();

  const [pass, setPass] = useState<SocialPass | "anon" | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<"confirmed" | "pending" | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch("/me/social-pass");
      if (res.status === 401) {
        setPass("anon");
        return;
      }
      if (!res.ok) {
        setError(true);
        return;
      }
      setPass((await res.json()) as SocialPass);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Vuelta de Stripe Checkout (?sub=return[&session_id=cs_…]): confirma
  // por polling - en dev el webhook no llega a localhost (mismo patrón
  // que /checkout/return).
  useEffect(() => {
    if (params.get("sub") !== "return") return;
    const sessionId = params.get("session_id");
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const res = await apiFetch("/me/social-pass/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            sessionId?.startsWith("cs_") ? { sessionId } : {},
          ),
        });
        if (res.ok) {
          const data = (await res.json()) as { activated?: boolean };
          if (data.activated) {
            setNotice("confirmed");
            void load();
            return;
          }
        }
      } catch {
        // reintenta abajo
      }
      if (attempts < 5) setTimeout(() => void tick(), 2000);
      else setNotice("pending");
    };
    void tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscribe = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await apiFetch("/me/social-pass/subscribe", {
        method: "POST",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { registerUrl: string };
      window.location.href = data.registerUrl;
    } catch {
      setError(true);
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      const res = await apiFetch("/me/social-pass/cancel", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setConfirmOpen(false);
      await load();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const p = pass === "anon" ? null : pass;
  const isActive = p?.status === "ACTIVE" || p?.status === "CANCEL_PENDING";
  const canSubscribe =
    pass === "anon" ||
    p == null ||
    p.status == null ||
    p.status === "CANCELED" ||
    p.status === "FAILED_CARD" ||
    p.status === "PENDING";
  const price = p?.price;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-sm text-ink/60 transition-colors hover:text-ink"
      >
        {t("backHome")}
      </Link>
      <header className="flex flex-col gap-2">
        <Badge variant="neon" className="self-start">
          {t("title")}
        </Badge>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-ink/60">{t("subtitle")}</p>
      </header>

      {notice === "confirmed" && (
        <p role="status" className="rounded-xl bg-neon/10 px-4 py-3 text-sm font-medium text-neon">
          {t("confirmed")}
        </p>
      )}
      {notice === "pending" && (
        <p role="status" className="rounded-xl bg-elevated px-4 py-3 text-sm text-ink/70">
          {t("confirmPending")}
        </p>
      )}

      {pass === null && !error ? (
        <SkeletonList items={3} />
      ) : (
        <>
          <Card>
            <ul className="flex flex-col gap-3 text-sm text-ink/80">
              <li>· {t("benefitCredits", { count: p?.creditsPerPeriod ?? 4 })}</li>
              <li>· {t("benefitPresale")}</li>
              <li>· {t("benefitDoor")}</li>
              <li>· {t("benefitReset")}</li>
            </ul>
            {price && (
              <p className="mt-4 border-t border-line pt-4">
                <PriceTag amount={price.amount} className="text-2xl font-bold" />
                <span className="ml-1 text-sm text-ink/50">/ mes</span>
              </p>
            )}
          </Card>

          {isActive && p && (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">
                  {p.status === "CANCEL_PENDING" || p.cancelAtPeriodEnd
                    ? t("memberCancelPending")
                    : t("memberActive")}
                </h2>
                <Badge variant="neon">{t("title")}</Badge>
              </div>
              <p className="mt-2 text-sm text-ink/70">
                {t("creditsLeft", {
                  used: p.creditsBalance,
                  total: p.creditsPerPeriod,
                })}
              </p>
              {p.currentPeriodEnd && (
                <p className="mt-1 text-sm text-ink/50">
                  {p.cancelAtPeriodEnd
                    ? t("activeUntil", {
                        date: dateFmt.format(new Date(p.currentPeriodEnd)),
                      })
                    : t("nextCharge", {
                        date: dateFmt.format(new Date(p.currentPeriodEnd)),
                      })}
                </p>
              )}
              {!p.cancelAtPeriodEnd && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4 self-start text-ink/60"
                  onClick={() => setConfirmOpen(true)}
                >
                  {t("cancelCta")}
                </Button>
              )}
            </Card>
          )}

          {p?.status === "FAILED_CARD" && (
            <Card>
              <p className="text-sm text-amber-400">{t("memberFailedCard")}</p>
            </Card>
          )}
          {p?.status === "PENDING" && (
            <Card>
              <p className="flex items-center gap-2 text-sm text-ink/70">
                <Spinner size="sm" /> {t("memberPending")}
              </p>
            </Card>
          )}
          {p?.status === "CANCELED" && (
            <p className="text-sm text-ink/60">{t("memberCanceled")}</p>
          )}

          {pass === "anon" ? (
            <Button href="/login?next=/pase" size="lg">
              {t("loginCta")}
            </Button>
          ) : (
            canSubscribe && (
              <div className="flex flex-col gap-2">
                <Button
                  size="lg"
                  disabled={busy}
                  onClick={() => void subscribe()}
                >
                  {busy && <Spinner size="sm" />}
                  {p?.status === "FAILED_CARD"
                    ? t("updateCardCta")
                    : p?.status === "CANCELED"
                      ? t("resubscribeCta")
                      : t("subscribeCta")}
                </Button>
                <p className="text-center text-xs text-ink/50">
                  {t("subscribeHint")}
                </p>
              </div>
            )
          )}
        </>
      )}

      {error && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {t("loadError")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t("retry")}
          </Button>
        </div>
      )}

      <ConfirmSheet
        open={confirmOpen}
        title={t("cancelTitle")}
        description={t("cancelDesc")}
        confirmLabel={t("cancelConfirm")}
        busy={busy}
        onConfirm={() => void cancel()}
        onClose={() => setConfirmOpen(false)}
      />
    </main>
  );
}
