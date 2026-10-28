"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { formatClp } from "@/lib/intl";

type Cycle = "monthly" | "semiannual" | "annual";

// Mensual-equivalente del ciclo (spec platform-billing, CYCLE_BILLED_MONTHS):
// semestral cobra 5.52 de 6 meses (-8%), anual 10.2 de 12 (-15%).
const EQUIV_FACTOR: Record<Cycle, number> = {
  monthly: 1,
  semiannual: 0.92,
  annual: 0.85,
};
const BILLED_MONTHS: Record<Cycle, number> = {
  monthly: 1,
  semiannual: 5.52,
  annual: 10.2,
};

export type PricingTier = {
  name: string;
  priceMonthly: number | null;
  limit: string;
  recommended: boolean;
  features: string[];
};

export type PricingMessages = {
  title: string;
  lead: string;
  perMonth: string;
  free: string;
  custom: string;
  recommended: string;
  cta: string;
  ctaCustom: string;
  note: string;
  cycles: Record<Cycle, string>;
  billedPer: { semiannual: string; annual: string };
  tiers: PricingTier[];
};

export function PricingSection({
  pricing,
  locale,
  registerHref,
}: {
  pricing: PricingMessages;
  locale: string;
  registerHref: string;
}) {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const equiv = (monthly: number) =>
    Math.round(monthly * EQUIV_FACTOR[cycle]);
  const billed = (monthly: number) =>
    Math.round(monthly * BILLED_MONTHS[cycle]);

  return (
    <section
      aria-labelledby="pricing-title"
      className="border-t border-ink/5 px-6 py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-5xl">
        <h2
          id="pricing-title"
          className="text-center text-2xl font-bold tracking-tight sm:text-3xl"
        >
          {pricing.title}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-center text-sm text-ink/50">
          {pricing.lead}
        </p>
        <div
          role="group"
          aria-label={pricing.title}
          className="mt-6 inline-flex w-full justify-center"
        >
          <div className="inline-flex rounded-full border border-ink/10 bg-surface/60 p-1">
            {(["monthly", "semiannual", "annual"] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cycle === c}
                onClick={() => setCycle(c)}
                className={`min-h-9 rounded-full px-4 text-sm font-medium transition-colors active:scale-[0.97] ${
                  cycle === c
                    ? "bg-neon text-on-accent"
                    : "text-ink/60 hover:text-ink"
                }`}
              >
                {pricing.cycles[c]}
              </button>
            ))}
          </div>
        </div>
        <ul
          className={`mt-10 grid gap-4 sm:grid-cols-2 lg:gap-6 ${
            pricing.tiers.length >= 4
              ? "lg:grid-cols-4"
              : "mx-auto max-w-4xl lg:grid-cols-3"
          }`}
        >
          {pricing.tiers.map((tier) => (
            <li
              key={tier.name}
              className={`flex flex-col rounded-2xl border p-6 ${
                tier.recommended
                  ? "border-neon bg-neon/5"
                  : "border-ink/10 bg-surface/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                {tier.recommended && (
                  <span className="rounded-full bg-neon px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-accent">
                    {pricing.recommended}
                  </span>
                )}
              </div>
              <p className="mt-3">
                {tier.priceMonthly == null ? (
                  <span className="text-2xl font-extrabold">
                    {pricing.custom}
                  </span>
                ) : tier.priceMonthly === 0 ? (
                  <span className="text-2xl font-extrabold">
                    {pricing.free}
                  </span>
                ) : (
                  <>
                    <span className="text-2xl font-extrabold">
                      {formatClp(equiv(tier.priceMonthly), locale)}
                    </span>
                    <span className="text-sm text-ink/50">
                      {" "}
                      {pricing.perMonth}
                    </span>
                  </>
                )}
              </p>
              {tier.priceMonthly != null &&
                tier.priceMonthly > 0 &&
                cycle !== "monthly" && (
                  <p className="mt-0.5 text-xs text-ink/50">
                    {pricing.billedPer[cycle]}:{" "}
                    {formatClp(billed(tier.priceMonthly), locale)}
                  </p>
                )}
              <p className="mt-1 text-xs text-ink/50">{tier.limit}</p>
              <ul className="mt-4 flex flex-col gap-1.5 text-sm text-ink/70">
                {tier.features.map((feature) => (
                  <li key={feature}>· {feature}</li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                <Link
                  href={registerHref}
                  prefetch={false}
                  className={`inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors active:scale-[0.97] ${
                    tier.recommended
                      ? "bg-neon text-on-accent hover:bg-neon-soft"
                      : "border border-ink/15 text-ink/80 hover:border-ink/30 hover:text-ink"
                  }`}
                >
                  {tier.priceMonthly == null
                    ? pricing.ctaCustom
                    : pricing.cta}
                </Link>
              </div>
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-6 max-w-xl whitespace-pre-line text-center text-xs text-ink/50">
          {pricing.note}
        </p>
      </div>
    </section>
  );
}
